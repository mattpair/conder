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
                cols.push({
                    dif: "struct",
                    type,
                    columnName: f.name,
                    fieldName: f.name,
                    kind: f.part.FieldType.isArray ? "1:many" : "1:1",
                    ref: table
                })
                structSet.delete(type.name)
                return

            case "Primitive":
                if (type.isArray) {
                    cols.push({
                        dif: "prim[]",
                        type: type,
                        columnName: f.name,
                        fieldName: f.name,
    
                    })
                } else {
                    cols.push({
                        dif: "prim",
                        type,
                        columnName: f.name,
                        fieldName: f.name
                    })
            }
                
        }
    })

    return new StoreCommander(nextTableName, cols)
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
}

type StructStoreRefCol = {
    dif: "struct"
    type: CompiledTypes.Struct
    columnName: string
    fieldName: string
    kind: "1:1" | "1:many"
    ref: StoreCommander
}

type PrimitiveArrayColumn = {
    dif: "prim[]"
    type: CompiledTypes.PrimitiveEntity
    columnName: string
    fieldName: string
}

type CommanderColumn = PrimitiveColumn | StructStoreRefCol | PrimitiveArrayColumn

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

    constructor(name: string, children: CommanderColumn[]) {
        this.name = name
        this.columns = children
    }

    public get create() : string {
        const creates: string[] = []

        const constraints: string[] = []
        
        const cols: string[]  = []
        const rels: string[] = []
        
        this.columns.forEach(c => {
            switch(c.dif) {
                case "prim":
                case "prim[]":     
                    const typeStr = toPostgresType(c.type)
                    cols.push(`${c.columnName}\t${typeStr}${c.dif === "prim[]" ? "[]" : ''}`)
                    break;
                    
                

                case "struct":
                    switch (c.kind) {
                        case "1:1":
                            creates.push(c.ref.create)
                            cols.push(`${c.columnName}\tINT`)
                            constraints.push(`constraint fk_${c.fieldName}
                                FOREIGN KEY(${c.fieldName})
                                    REFERENCES ${c.ref.name}(conduit_entity_id)`)
                            break;
                        case "1:many":
                            creates.push(c.ref.create)
                            rels.push(`
                            CREATE TABLE rel_${this.name}_and_${c.ref.name} (
                                left INT,
                                right INT,
                                constraint fk_${c.ref.name}_right
                                    FOREIGN KEY(right)
                                        REFERENCES ${c.ref.name}(conduit_entity_id)
                                constraint fk_${this.name}_left
                                    FOREIGN KEY(left)
                                        REFERENCES ${this.name}(conduit_entity_id)
                            )`)
                            break;

                        default: assertNever(c.kind)
                    }
                    

                    
                    break;
            }  
        })

        constraints.push("PRIMARY KEY(conduit_entity_id)")
        cols.push("conduit_entity_id\tINT\tGENERATED ALWAYS AS ENTITY ID")

    
        
        creates.push(`
        CREATE TABLE ${this.name} (
            ${[...cols, ...constraints].join(",\n")}
        );`)
    
        return `${creates.join("\n")}${rels.join("\n")}`
    }

    public insert(varname: string, ret: ReturnInstruction, nextReturnId: number): string[] {

        const columns: string[] = []
        const values: string[] = []
        const array: string[]= []
        const inserts: string[] = []
        let colCount = 0
        this.columns.forEach(c => {
            switch(c.dif) {
                case "prim":
                case "prim[]":
                    columns.push(c.columnName)
                    values.push(`$${++colCount}`)
                    array.push(`&${varname}.${c.fieldName}`)
                    break;

                case "struct":
                    switch(c.kind) {
                        case "1:many":
                            // const manyRet = `ret${nextReturnId++}`
                            // inserts.push(...c.ref.insert(`${varname}.${c.fieldName}`, {kind: "save", name: manyRet}, nextReturnId))
// let ${insert.return_name} = client.query("${insert.sql}", &[${insert.array}]).await?;
                            break;
                        case "1:1":
                            const returnedId = `ret${nextReturnId++}`
                            inserts.push(...c.ref.insert(`${varname}.${c.fieldName}`, {kind: "save", name: returnedId}, nextReturnId))
                            columns.push(c.columnName)
                            values.push(`$${++colCount}`)
                            array.push(`&(${returnedId}.get(0))`)
                            break;
                    }
                    break;

                
                default: assertNever(c)
            }
        })


        const tableAndColumns: string = `${this.name}(${columns.join(", ")})`
        const insertionSql = `insert into ${tableAndColumns} values (${values.join(", ")})`

        switch (ret.kind) {
            case "save": {
                const completequery = `${insertionSql} RETURNING conduit_entity_id`
                const rustCode = `let ${ret.name} = client.query("${completequery}", &[${array}]).await?;`
                inserts.push(rustCode)
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
    
}

export function generateStoreCommands(val: CompiledTypes.Store): StoreCommander {
    const store: StoreCommander = assembleStoreTree(val.stores,  new Set([val.stores.name]), val.name)

    return store
}
