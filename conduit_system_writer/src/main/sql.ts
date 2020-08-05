import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import { assertNever } from 'conduit_compiler/dist/src/main/utils';


export type InsertCodelet = {
    readonly sql: string,
    readonly array: string
}

export function generateInsertStatement(stmt: CompiledTypes.Append): InsertCodelet {
    const columns = stmt.into.stores.children.Field.map(i => i.name).join(", ")
    const tableAndColumns: string = `${stmt.into.name}(${columns})`
    const values = `values (${stmt.inserting.type.val.children.Field.map((_, i) => `$${i + 1}`).join(", ")})`
    const array = `&[${stmt.inserting.type.val.children.Field.map(f => `&${stmt.inserting.name}.${f.name}`).join(", ")}]`
    return {
        sql: `insert into ${tableAndColumns} ${values}`,
        array
    }
}

type ColumnDef = Readonly<{
    name: string
    type: string
}>

type ReferenceDef = Readonly<{
    kind: "1:1" | "1:Many"
    name: string
    table: TableDef
}>

type TableDef = Readonly<{
    name: string
    cols: ColumnDef[]
    refs: ReferenceDef[]
}>

export function flattenStructForStorage(struct: CompiledTypes.Struct, structSet: Set<string>, nextTableName: string): TableDef {
    const thisTable: TableDef = {
        name: nextTableName,
        cols: [],
        refs: []
    }

    
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
                const table = flattenStructForStorage(type, structSet, `${nextTableName}_${f.name}`)
                thisTable.refs.push({name: f.name, table, kind: f.part.FieldType.isArray ? "1:Many" : "1:1"})
                structSet.delete(type.name)
                return

            case "Primitive":
                let typeStr = ''
                const prim = type.val
                switch(prim) {
                    case Lexicon.Symbol.bool:
                        typeStr = "boolean"
                        break
                    case Lexicon.Symbol.bytes:
                        throw Error("bytes aren't supported for stores yet")

                    case Lexicon.Symbol.double:
                        typeStr = "double precision"
                        break
                    case Lexicon.Symbol.float:
                        typeStr ="real"
                        break
                    case Lexicon.Symbol.int32:
                        typeStr = "integer"
                        break
                    case Lexicon.Symbol.int64:
                        typeStr = "bigint"
                        break
                    case Lexicon.Symbol.uint32:
                    case Lexicon.Symbol.uint64:
                        typeStr = "bigint"
                        console.warn("storing uints as signed integers")
                        break
                    case Lexicon.Symbol.string:
                        typeStr = "text"
                        break

                    default: Utilities.assertNever(prim)
                }
                thisTable.cols.push({name: f.name, type: typeStr})
        }
    })

    return thisTable
}

function writeCreateTables(store: TableDef): StoreCommander {
    const creates: string[] = []
    const constraints: string[] = ["PRIMARY KEY(conduit_entity_id)"]
    const cols = store.cols.map(c => `${c.name}\t${c.type}`)
    const children: StoreCommander[] = []
    cols.push("conduit_entity_id\tINT\tGENERATED ALWAYS AS ENTITY ID")


    store.refs.forEach(ref => {
        children.push(writeCreateTables(ref.table))

        switch(ref.kind){
            case "1:1":
                cols.push(`${ref.name}\tINT`)
                constraints.push(`CONSTRAINT fk_${ref.name}\n\tFOREIGN KEY(${ref.name})\n\t\tREFERENCES ${ref.table.name}(conduit_entity_id)`)
                break
            case "1:Many":
                creates.push(`
                CREATE TABLE rel_${ref.name}_and_${ref.table.name} (
                    left INT,
                    right INT,
                    constraint fk_${ref.name}_right
                        FOREIGN KEY(right)
                            REFERENCES ${ref.table.name}(conduit_entity_id)
                    constraint fk_${ref.name}_left
                        FOREIGN KEY(left)
                            REFERENCES ${store.name}(conduit_entity_id)
                )
                `)
                break

            default: assertNever(ref.kind)
        }
    })
    
    creates.push(`
    CREATE TABLE ${store.name} (
        ${[...cols, ...constraints].join(",\n")}
    );`)

    return new StoreCommander(creates.join("\n"), children)
}

export class StoreCommander {
    private readonly create_sql: string
    private readonly children: StoreCommander[]

    constructor(create: string, children: StoreCommander[]) {
        this.create_sql = create
        this.children = children
    }

    public get create() : string {
        return `${this.children.map(child => child.create).join("\n")}\n${this.create_sql}`
    }
    
}

export function generateStoreCommands(val: CompiledTypes.Store): StoreCommander {
    const store: TableDef = flattenStructForStorage(val.stores,  new Set([val.stores.name]), val.name)


    return writeCreateTables(store)
}