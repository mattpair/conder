import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import { assertNever } from 'conduit_compiler/dist/src/main/utils';



function assembleStoreTree(struct: CompiledTypes.Struct, structSet: Set<string>, nextTableName: string): StoreCommander {
    const cols: CommanderColumn[] = []

    
    struct.children.Field.forEach(f => {
        const type = f.part.FieldType.differentiate()

        switch(type.kind) {
            case "Enum":
                throw Error("Don't support enum stores yet")
            case "Struct":
                if (structSet.has(type.name)) {
                    throw Error(`Cannot store type ${struct.name} because ${type.name} is recursive`)
                }
                structSet.add(type.name)
                const table = assembleStoreTree(type, structSet, `${nextTableName}_${f.name}`)
                switch(f.part.FieldType.modification){
                    case "array":
                        cols.push({
                            dif: "1:many",
                            type,
                            fieldName: f.name,
                            ref: table,
                            refTableName: `rel_${nextTableName}_${struct.name}_and_${type.name}`
    
                        })
                        break
                    case "optional":
                    case "none":
                        cols.push({
                            dif: "1:1",
                            type,
                            columnName: `${f.name}_ptr`,
                            fieldName: f.name,
                            ref: table,
                            modification: f.part.FieldType.modification
                        })

                }
                structSet.delete(type.name)
                return

            case "Primitive":
                cols.push({
                    dif: "prim",
                    modification: f.part.FieldType.modification,
                    type,
                    columnName: f.name,
                    fieldName: f.name
                })
                break
            default:assertNever(type)
                
        }
    })

    return new StoreCommander(nextTableName, cols, struct.name)
}

export type ReturnInstruction = Readonly<{
    kind: "save"
    name: string
} | {kind: "drop"}> 

type PrimitiveColumn = {
    dif: "prim"
    type: CompiledTypes.PrimitiveEntity
    columnName: string
    fieldName: string
    modification: CompiledTypes.TypeModification
}

type StructArrayCol = {
    dif: "1:many"
    type: CompiledTypes.Struct
    fieldName: string
    refTableName: string
    ref: StoreCommander
}

type StructRefCol = {
    dif: "1:1"
    type: CompiledTypes.Struct
    columnName: string
    fieldName: string
    ref: StoreCommander,
    modification: "optional" | "none"
}

type CommanderColumn = PrimitiveColumn | StructArrayCol | StructRefCol

function toPostgresType(prim: CompiledTypes.PrimitiveEntity): string {

    switch(prim.val) {
        case Lexicon.Symbol.bool:
            return "boolean"
        
        case Lexicon.Symbol.bytes:
            throw Error("bytes aren't supported for stores yet")

        case Lexicon.Symbol.double:
            return "double precision"
            
        case Lexicon.Symbol.float:
            return "real"
            
        case Lexicon.Symbol.int32:
            return "integer"
            
        case Lexicon.Symbol.int64:
            return "bigint"
            
        case Lexicon.Symbol.uint32:
        case Lexicon.Symbol.uint64:
            console.warn("storing uints as signed integers")
            return "bigint"
            
            
        case Lexicon.Symbol.string:
            return "text"

        default: Utilities.assertNever(prim.val)
    }
}


export class StoreCommander {
    private readonly name: string
    private readonly columns: CommanderColumn[]
    private readonly typeName: string

    constructor(name: string, children: CommanderColumn[], typeName: string) {
        this.name = name
        this.columns = children
        this.typeName = typeName
    }

    public get create() : string {
        const creates: string[] = []

        const constraints: string[] = []
        
        const cols: string[]  = []
        const rels: string[] = []
        
        this.columns.forEach(c => {
            switch(c.dif) {
                case "prim":
                    const typeStr = toPostgresType(c.type)
                    let appendStr = ''
                    switch (c.modification) {
                        case "array":
                            appendStr = "[]"
                            break;
                        case "none":
                            appendStr = " NOT NULL"   
                    }

                    cols.push(`${c.columnName}\t${typeStr}${appendStr}`)
                    break;
                    
                

                case "1:1":
                    creates.push(c.ref.create)
                    cols.push(`${c.columnName}\tINT`)
                    constraints.push(`FOREIGN KEY(${c.fieldName}) REFERENCES ${c.ref.name}(conduit_entity_id)`)
                    break;

                case "1:many":
                    creates.push(c.ref.create)
                    rels.push(`
                    CREATE TABLE ${c.refTableName} (
                        left_ptr INT,
                        right_ptr INT,
                        FOREIGN KEY(right_ptr) REFERENCES ${c.ref.name}(conduit_entity_id),
                        FOREIGN KEY(left_ptr) REFERENCES ${this.name}(conduit_entity_id)
                    );`)
                    break;

                    
                default: assertNever(c)
            }  
        })

        constraints.push("PRIMARY KEY(conduit_entity_id)")
        cols.push("conduit_entity_id\tINT\tGENERATED ALWAYS AS IDENTITY")

    
        
        creates.push(`
        CREATE TABLE ${this.name} (
            ${[...cols, ...constraints].join(",\n")}
        );`)
    
        return `${creates.join("\n")}${rels.join("\n")}`
    }

    public insert(varname: string, ret: ReturnInstruction, nextReturnId: () => number): string[] {

        const columns: string[] = []
        const values: string[] = []
        const array: string[]= []
        const inserts: string[] = []
        const postInsertPtrs: {relTableName: string, ptrVec: string}[] = []
        let colCount = 0
        this.columns.forEach(c => {
            switch(c.dif) {
                case "prim":
                    columns.push(c.columnName)
                    values.push(`$${++colCount}`)
                    array.push(`&${varname}.${c.fieldName}`)
                    break;

                case "1:many":
                    const manyRet = `ret${nextReturnId()}`
                    const vecVarName = `vec_${manyRet}`
                    const rowVarName = `row${nextReturnId()}`
                    const forLoop = `
                    let mut ${vecVarName}: Vec<i32> = Vec::new();
                    for ${rowVarName} in &${varname}.${c.fieldName} {
                        ${c.ref.insert(`${rowVarName}`, {kind: "save", name: manyRet}, nextReturnId).join("\n")}
                        ${vecVarName}.push(${manyRet}[0].get(0));
                    }
                    `

                    postInsertPtrs.push({relTableName: c.refTableName, ptrVec: vecVarName})
                    inserts.push(forLoop)
                    break;

                case "1:1":
                    const returnedId = `ret${nextReturnId()}`
                    inserts.push(...c.ref.insert(`${varname}.${c.fieldName}`, {kind: "save", name: returnedId}, nextReturnId))
                    columns.push(c.columnName)
                    values.push(`$${++colCount}`)
                    array.push(`&(${returnedId}.get(0))`)
                    break;
                    
                
                default: assertNever(c)
            }
        })

        let insertionSql = ''
        if (columns.length === 0) {
            insertionSql = `insert into ${this.name} default values`
        } else {
            const tableAndColumns: string = `${this.name}(${columns.join(", ")})`
            insertionSql = `insert into ${tableAndColumns} values (${values.join(", ")})`

        }
        values.push("NULL")
        if (postInsertPtrs.length > 0 && ret.kind !== "save") {
            ret = {kind: "save", name: `ret${nextReturnId()}`}
        }

        switch (ret.kind) {
            case "save": {
                const returnName = ret.name
                const completequery = `${insertionSql} RETURNING conduit_entity_id`
                const rustCode = `let ${returnName} = client.query("${completequery}", &[${array}]).await?;`
                const entId = `ent${nextReturnId()}`
                inserts.push(rustCode)
                postInsertPtrs.forEach(post => {
                    inserts.push(`

                    let ${entId}: i32 = ${returnName}[0].get(0);
                    while let Some(child_id) = ${post.ptrVec}.pop() {
                        client.query("insert into ${post.relTableName}(left_ptr, right_ptr) values ($1, $2)", &[&${entId}, &child_id]).await?;
                    }
                        
                    `)
                })
                break
            }
            case "drop": {   
                inserts.push(`client.query("${insertionSql}", &[${array}]).await?;`)
                break
            }

            default: assertNever(ret)
        }
        
        return inserts
    }

    public getAll(returnVecName: string, nextReturnId: () => number, whereClause:string=''): string {
        const structFieldAssignment:string[] = []
        const childrenFetches: string[] = []
        const extractions: string[] = []
        const rowVarName = `row${nextReturnId()}`
        const allVarName = `all${this.typeName}${nextReturnId()}`
        const thisEntityIdVar = `${this.typeName}EntityId${nextReturnId()}`

        this.columns.forEach((col) => {
            switch (col.dif) {
                case "prim":
                    structFieldAssignment.push(`${col.fieldName}: ${rowVarName}.get("${col.columnName}")`)
                    break;
                case "1:1": {
                    const childRetName = `all${col.type.name}${nextReturnId()}`
                    const childMapVar = `entityIdTo${col.type.name}${nextReturnId()}`
                    childrenFetches.push(col.ref.getAll(
                        childRetName, 
                        nextReturnId,
                        `WHERE conduit_entity_id in (select ${col.columnName} from ${this.name})`
                    ))
                    const childRowVar = `row${nextReturnId()}`
                    
                    childrenFetches.push(`
                    let mut ${childMapVar}: HashMap<i32, &${col.type.name}> = HashMap::with_capacity(${childRetName}.len());
                    while let Some(${childRowVar}) = ${childRetName}.pop() {
                        ${childMapVar}.insert(${childRowVar}.conduit_entity_id, ${childRowVar})
                    }
                    `)
                    const extractedVarName = `extracted${col.type.name}${nextReturnId()}`
                    extractions.push(`
                    // Extracting ${col.type.name}
                    let ${extractedVarName} = match ${childMapVar}.get(&${rowVarName}.get("${col.columnName}")) {
                        Some(t) => t,
                        None => panic("did not get an expected ${col.columnName}")
                    }
                    `)

                    
                    structFieldAssignment.push(`${col.fieldName}: ${extractedVarName}` )

                    break;
                }

                case "1:many": {
                    const childRetName = `all${col.type.name}${nextReturnId()}`
                    const childMapVar = `entityIdTo${col.type.name}${nextReturnId()}`
                    childrenFetches.push(col.ref.getAll(
                        childRetName, 
                        nextReturnId,
                        `WHERE conduit_entity_id in (select right_ptr from ${col.refTableName})`
                    ))

                    
                    const childRowVar = `row${nextReturnId()}`
                    
                    childrenFetches.push(`
                    let mut ${childMapVar}: HashMap<i32, ${col.type.name}> = HashMap::with_capacity(${childRetName}.len());
                    while let Some(${childRowVar}) = ${childRetName}.pop() {
                        ${childMapVar}.insert(${childRowVar}.conduit_entity_id.unwrap(), ${childRowVar});
                    }
                    `)

                    const lrquery = `lr${nextReturnId()}`
                    const lrmap = `lrmap${nextReturnId()}`
                    const lrrow = `lrrow${nextReturnId()}`
                    const l = `l${nextReturnId()}`
                    const e = `e${nextReturnId()}`
                    
                    childrenFetches.push(`
                    let mut ${lrquery} = client.query("select left_ptr, right_ptr from ${col.refTableName}", &[]).await?;
                    let mut ${lrmap}: HashMap<i32, Vec<i32>> = HashMap::new();
                    while let Some(${lrrow}) = ${lrquery}.pop() {
                        let ${l} = ${lrrow}.get("left_ptr");
                        ${lrmap}.entry(${l})
                            .and_modify(|${e}| { ${e}.push(${lrrow}.get("right_ptr")) })
                            .or_insert(vec![${lrrow}.get("right_ptr")]);
                    }

                    `)
                    
                    const entries = `entries${col.type.name}${nextReturnId()}`
                    const childInstances = `instances${col.type.name}${nextReturnId()}`
                    const childPtr = `child${nextReturnId()}`
                    const empty = `empty${nextReturnId()}`
                    extractions.push(`
                    // Extracting ${col.type.name}s
                    let ${empty} = Vec::with_capacity(0);
                    let ${entries} = match ${lrmap}.get(&${thisEntityIdVar}) {
                        Some(ptrs) => ptrs,
                        None => &${empty}
                    };

                    let mut ${childInstances}: Vec<${col.type.name}> = Vec::with_capacity(${entries}.len());

                    for ${childPtr} in ${entries} {
                        match ${childMapVar}.get(&${childPtr}) {
                            Some(real) => ${childInstances}.push(real.clone()),
                            None => panic!("could not find expected ${col.type.name}")
                        };
                    }
                    `)

                    
                    structFieldAssignment.push(`${col.fieldName}: ${childInstances}` )

                    break;
                }

                default: assertNever(col)
            }
            
        })

        return `
        // Gettting all ${this.typeName}
        let mut ${allVarName} = client.query("select * from ${this.name} ${whereClause}", &[]).await?;

        ${childrenFetches.join("\n")}

        let mut ${returnVecName} = Vec::with_capacity(${allVarName}.len());

        while let Some(${rowVarName}) = ${allVarName}.pop() {
            let ${thisEntityIdVar} = ${rowVarName}.get("conduit_entity_id");
            ${extractions.join('\n')}
            ${returnVecName}.push(${this.typeName} {
                ${structFieldAssignment.join(",\n")},
                conduit_entity_id: Some(${thisEntityIdVar})
            })
        }

        `
    }
    
}

export function generateStoreCommands(val: CompiledTypes.Store): StoreCommander {
    const store: StoreCommander = assembleStoreTree(val.stores,  new Set([val.stores.name]), val.name)

    return store
}
