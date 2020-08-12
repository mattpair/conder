import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { Primitives } from 'conduit_compiler/dist/src/main/lexicon';



function assembleStoreTree(inScope: CompiledTypes.ScopeMap, struct: CompiledTypes.Struct, structSet: Set<string>, nextTableName: string): HierarchicalStore {
    const cols: CommanderColumn[] = []

    
    struct.children.Field.forEach(f => {
        const type = f.part.FieldType.differentiate()

        switch(type.kind) {
            case "custom": {
                const entity = inScope.getEntityOfType(type.name, "Struct", "Enum")
                switch (entity.kind) {
                    case "Enum":
                        if (f.part.FieldType.modification === "optional") {
                            throw Error(`Enum fields may not be optional`)
                        }

                        cols.push({dif: "enum", type: entity, columnName: f.name, fieldName: f.name, modification: f.part.FieldType.modification})

                        return

                    case "Struct":
                        if (structSet.has(type.name)) {
                            throw Error(`Cannot store type ${struct.name} because ${entity.name} is recursive`)
                        }
                        structSet.add(entity.name)
                        const table = assembleStoreTree(inScope, entity, structSet, `${nextTableName}_${f.name}`)
                        switch(f.part.FieldType.modification){
                            case "array":
                                cols.push({
                                    dif: "1:many",
                                    type: entity,
                                    fieldName: f.name,
                                    ref: table,
                                    refTableName: `rel_${nextTableName}_${struct.name}_and_${type.name}`
            
                                })
                                break
                            case "optional":
                            case "none":
                                cols.push({
                                    dif: "1:1",
                                    type: entity,
                                    columnName: `${f.name}_ptr`,
                                    fieldName: f.name,
                                    ref: table,
                                    modification: f.part.FieldType.modification
                                })

                        }
                        structSet.delete(type.name)
                        return
                }
                
            }
            
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

    return {
        name: nextTableName, 
        columns: cols, 
        typeName: struct.name,
        specName: `querySpec_${nextTableName}`
    }
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

type EnumColumn = {
    dif: "enum"
    type: CompiledTypes.Enum
    columnName: string
    fieldName: string
    modification: Exclude<CompiledTypes.TypeModification, "optional">
}

type StructArrayCol = {
    dif: "1:many"
    type: CompiledTypes.Struct
    fieldName: string
    refTableName: string
    ref: HierarchicalStore
}

type StructRefCol = {
    dif: "1:1"
    type: CompiledTypes.Struct
    columnName: string
    fieldName: string
    ref: HierarchicalStore,
    modification: "optional" | "none"
}

type CommanderColumn = PrimitiveColumn | StructArrayCol | StructRefCol | EnumColumn

export type HierarchicalStore = Readonly<{
    name: string
    columns: CommanderColumn[]
    typeName: string
    specName: string
}>

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

function makePrimitiveColumn(c: PrimitiveColumn | EnumColumn): string {
    const typeStr = c.dif === "enum" ? "smallint" : toPostgresType(c.type)
    let appendStr = ''
    switch (c.modification) {
        case "array":
            appendStr = "[]"
            break;
        case "none":
            appendStr = " NOT NULL"   
    }
    return `${c.columnName}\t${typeStr}${appendStr}`
}


export function generateQuerySpecsFor(store: HierarchicalStore): string {
    const plainColumnStrs: string[] = []
    const childSpecs: string[] = []
    const fields: string[] = []
    store.columns.forEach(col => {
        switch (col.dif) {
            case "prim":
            case "enum":
                // plainColumnStrs.push(`const ${store.name}_${col.columnName}: &'static str = "${col.columnName}";`)
                break

            case "1:many":
            case "1:1":
                fields.push(`${col.fieldName}: ${col.ref.specName}`)
                childSpecs.push(generateQuerySpecsFor(col.ref))
                break

            default: assertNever(col)
        }
    })

    // if (plainColumnStrs.length > 0) {
    
    //     fields.push("simpleSelections: Vec<u16>")
    // }
    
    return ` 
    ${plainColumnStrs.join("\n")}
    
    #[derive(Serialize, Deserialize, Clone)]
    struct ${store.specName}${fields.length > 0 ? ` {
        ${fields.join(",\n")}
    }` : `;`}
    
    ${childSpecs.join("\n")}
    `
}

export function createSQLFor(store: HierarchicalStore) : string {
    const creates: string[] = []

    const constraints: string[] = []
    
    const cols: string[]  = []
    const rels: string[] = []
    
    store.columns.forEach(c => {
        switch(c.dif) {
            case "prim":
            case "enum":
                cols.push(makePrimitiveColumn(c))
                break;

            case "1:1":
                creates.push(createSQLFor(c.ref))
                cols.push(`${c.columnName}\tINT`)
                constraints.push(`FOREIGN KEY(${c.columnName}) REFERENCES ${c.ref.name}(conduit_entity_id)`)
                break;

            case "1:many":
                creates.push(createSQLFor(c.ref))
                rels.push(`
                CREATE TABLE ${c.refTableName} (
                    left_ptr INT,
                    right_ptr INT,
                    FOREIGN KEY(right_ptr) REFERENCES ${c.ref.name}(conduit_entity_id),
                    FOREIGN KEY(left_ptr) REFERENCES ${store.name}(conduit_entity_id)
                );`)
                break;

                
            default: assertNever(c)
        }  
    })

    constraints.push("PRIMARY KEY(conduit_entity_id)")
    cols.push("conduit_entity_id\tINT\tGENERATED ALWAYS AS IDENTITY")


    
    creates.push(`
    CREATE TABLE ${store.name} (
        ${[...cols, ...constraints].join(",\n")}
    );`)

    return `${creates.join("\n")}${rels.join("\n")}`
}

export function generateInsertRustCode(store: HierarchicalStore, varname: string, ret: ReturnInstruction, nextReturnId: () => number): string[] {

    const columns: string[] = []
    const values: string[] = []
    const array: string[]= []
    const inserts: string[] = []
    const postInsertPtrs: {relTableName: string, ptrVec: string}[] = []
    let colCount = 0
    store.columns.forEach(c => {
        switch(c.dif) {
            case "enum":
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
                    ${generateInsertRustCode(c.ref, `${rowVarName}`, {kind: "save", name: manyRet}, nextReturnId).join("\n")}
                    ${vecVarName}.push(${manyRet}[0].get(0));
                }
                `

                postInsertPtrs.push({relTableName: c.refTableName, ptrVec: vecVarName})
                inserts.push(forLoop)
                break;

            case "1:1":
                const returnedId = `ret${nextReturnId()}`
                
                if (c.modification === "optional") {
                    const unwrapped = `unwrapped${nextReturnId()}`
                    const optionalChildInsertions = generateInsertRustCode(c.ref, unwrapped, {kind: "save", name: returnedId}, nextReturnId)
                    const optionalReturnId = `optional${nextReturnId()}`
                    inserts.push(`
                        let ${optionalReturnId}: Option<i32> = match ${varname}.${c.fieldName} {
                            Some(${unwrapped}) => {
                                ${optionalChildInsertions.join('\n')}

                                Some(${returnedId}[0].get(0))
                            },
                            None => None
                        };
                    `)
                    columns.push(c.columnName)
                    values.push(`$${++colCount}`)
                    array.push(`&${optionalReturnId}`)
                } else {

                    inserts.push(...generateInsertRustCode(c.ref, `${varname}.${c.fieldName}`, {kind: "save", name: returnedId}, nextReturnId))
                    columns.push(c.columnName)
                    values.push(`$${++colCount}`)
                    array.push(`&(${returnedId}.get(0))`)

                }
                
                break;
                
            
            default: assertNever(c)
        }
    })

    let insertionSql = ''
    if (columns.length === 0) {
        insertionSql = `insert into ${store.name} default values`
    } else {
        const tableAndColumns: string = `${store.name}(${columns.join(", ")})`
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

function generateQueryInterpreterInternal(specVarName: string, store: HierarchicalStore, nextReturnId: () => number, returnVecName: string, whereClause: string): string {
    const structFieldAssignment:string[] = []
    const childrenFetches: string[] = []
    const extractions: string[] = []
    const rowVarName = `row${nextReturnId()}`
    const allVarName = `all${store.typeName}${nextReturnId()}`
    const thisEntityIdVar = `${store.typeName}EntityId${nextReturnId()}`

    store.columns.forEach((col) => {
        switch (col.dif) {
            case "enum":
            case "prim":
                structFieldAssignment.push(`${col.fieldName}: ${rowVarName}.get("${col.columnName}")`)
                break;
            case "1:1": {
                const childRetName = `all${col.type.name}${nextReturnId()}`
                childrenFetches.push(generateQueryInterpreterInternal(
                    '',    
                    col.ref,
                    nextReturnId,
                    childRetName, 
                    `WHERE conduit_entity_id in (select ${col.columnName} from ${store.name})`
                ))
                const childMapVar = `entityIdTo${col.type.name}${nextReturnId()}`
                    
                    const childRowVar = `row${nextReturnId()}`
                    
                    childrenFetches.push(`
                    let mut ${childMapVar}: HashMap<i32, ${col.type.name}> = HashMap::with_capacity(${childRetName}.len());
                    while let Some(${childRowVar}) = ${childRetName}.pop() {
                        ${childMapVar}.insert(${childRowVar}.conduit_entity_id.unwrap(), ${childRowVar});
                    }
                    `)
                    const extractedVarName = `extracted${col.type.name}${nextReturnId()}`
                    

                if (col.modification === "optional") {
                    extractions.push(`
                    // Extracting ${col.type.name}
                    let ${extractedVarName} = match ${rowVarName}.get("${col.columnName}") {
                        Some(ptr) => ${childMapVar}.get(&ptr),
                        None => None
                    };
                    
                    `)

                    structFieldAssignment.push(`${col.fieldName}: ${extractedVarName}.map(|i| i.clone())` )

                } else {
                    extractions.push(`
                    // Extracting ${col.type.name}
                    let ${extractedVarName} = match ${childMapVar}.get(&${rowVarName}.get("${col.columnName}")) {
                        Some(t) => t,
                        None => panic!("did not get an expected ${col.columnName}")
                    };
                    `)
                    structFieldAssignment.push(`${col.fieldName}: ${extractedVarName}` )
                }
                

                break;
            }

            case "1:many": {
                const childRetName = `all${col.type.name}${nextReturnId()}`
                const childMapVar = `entityIdTo${col.type.name}${nextReturnId()}`
                childrenFetches.push(generateQueryInterpreterInternal(
                    '',
                    col.ref,
                    nextReturnId,
                    childRetName, 
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
    // Gettting all ${store.typeName}
    let mut ${allVarName} = client.query("select * from ${store.name} ${whereClause}", &[]).await?;

    ${childrenFetches.join("\n")}

    let mut ${returnVecName} = Vec::with_capacity(${allVarName}.len());

    while let Some(${rowVarName}) = ${allVarName}.pop() {
        let ${thisEntityIdVar} = ${rowVarName}.get("conduit_entity_id");
        ${extractions.join('\n')}
        ${returnVecName}.push(${store.typeName} {
            ${structFieldAssignment.join(",\n")},
            conduit_entity_id: Some(${thisEntityIdVar})
        })
    }

    `

}


export function generateQueryInterpreter(store: HierarchicalStore): string {
    let n = 0

    return `
    async fn query_interpreter_${store.name}(querySpec: ${store.specName}, client: &Client) -> Result<Vec<${store.typeName}>, Error> {
        ${generateQueryInterpreterInternal("querySpec", store, () => n++, "out", '')}
        return Ok(out);
    }
    `

}


export function generateRustGetAllQuerySpec(store: HierarchicalStore): string {
    const fields: string[] = []
    store.columns.forEach(col => {
        switch(col.dif) {
            case "1:1":
            case "1:many":
                fields.push(`${col.fieldName}: ${generateRustGetAllQuerySpec(col.ref)}`)
                break
            case "enum":
            case "prim":
                break
            default: assertNever(col)
        }
    }) 
    if (fields.length > 0) {
        return `${store.specName} {
            ${fields.join(",\n")}
        }`
    }
    return `${store.specName}`
    
}
    
export function generateHierarchicalStore(val: CompiledTypes.Store, inScope: CompiledTypes.ScopeMap): HierarchicalStore {
    return assembleStoreTree(
        inScope,
        inScope.getEntityOfType(val.stores, "Struct"),  
        new Set([val.stores]), val.name)
}
