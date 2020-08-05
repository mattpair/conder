import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';


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
                thisTable.refs.push({name: f.name, table})
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

function writeCreateTables(store: TableDef): string[] {
    const creates: string[] = []

    store.refs.forEach(ref => {
        creates.push(...writeCreateTables(ref.table))
    })

    const constraints: string[] = ["PRIMARY KEY(conduit_entity_id)"]
    const cols = store.cols.map(c => `${c.name}\t${c.type}`)
    cols.push("conduit_entity_id\tINT\tGENERATED ALWAYS AS ENTITY ID")
    cols.push(...store.refs.map(r => `${r.name}\tINT`))

    constraints.push(...store.refs.map(r => `CONSTRAINT fk_${r.name}\n\tFOREIGN KEY(${r.name})\n\t\tREFERENCES ${r.table.name}(conduit_entity_id)`))

    creates.push(`
    CREATE TABLE ${store.name} (
        ${[...cols, ...constraints].join(",\n")}
    );`)

    return creates
}

export function generateTable(val: CompiledTypes.Store): string {
    const store: TableDef = flattenStructForStorage(val.stores,  new Set([val.stores.name]), val.name)


    return writeCreateTables(store).join("\n")

}