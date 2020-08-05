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

export function flattenStructForStorage(struct: CompiledTypes.Struct, columnPrefix: string, structSet: Set<string>): ColumnDef[] {
    const prefix = columnPrefix.length ? columnPrefix + "_" : ""

    const cols: ColumnDef[] = []
    
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
                const childs = flattenStructForStorage(type, `${f.name}_${columnPrefix}`, structSet)
                cols.push(...childs)
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
                cols.push({name: `${prefix}${f.name}`, type: typeStr})
        }
    })

    return cols
}

export function generateTable(val: CompiledTypes.Store): string {
    const cols: ColumnDef[] = flattenStructForStorage(val.stores, '', new Set([val.stores.name]))
    console.log(cols)
    return `
    CREATE TABLE ${val.name} (
        ${cols.map(c => `${c.name}\t${c.type}`).join(",\n")}
    );

    `

}