import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes, Lexicon } from "conduit_compiler"

function TestCodeGen(description: string, modifier: (m: ManifestBuilder) => void) {
    test(description, async () => {
        const entBuilder = new ManifestBuilder()
        modifier(entBuilder)
        const r = await writeRustAndContainerCode.func({manifest: entBuilder.build()})
        const mainFiles = r.backend.main.files.filter(f => !(/Cargo/.test(f.name)))
        expect(mainFiles).toMatchSnapshot("main files")
        expect(r.backend.postgres.files).toMatchSnapshot("postgres files")
    })
}



TestCodeGen("empty everything", () => {})

TestCodeGen("only one struct", (m) => {
    m.struct("test").addPrimitiveField("onlyField", true, Lexicon.Symbol.bool).build()
})

TestCodeGen("struct containing struct stored", (m) => {
    m.struct("inner").addPrimitiveField("fieldA", true, Lexicon.Symbol.double).build()
    m.struct("outer").addStructOrEnumField("inner", true, "inner").build()
    m.store("outerStore", "outer")
})


class StructBuilder {
    readonly name: string
    readonly fields: CompiledTypes.Field[]
    readonly parent: ManifestBuilder
    constructor(name: string, parent: ManifestBuilder) {
        this.name = name
        this.fields = []
        this.parent = parent
    }

    addPrimitiveField(name: string, isRequired: boolean, type: Lexicon.PrimitiveUnion): this {
        this.fields.push({
            kind: "Field",
            loc: ManifestBuilder.loc,
            isRequired,
            name,
            part: {
                FieldType: {
                    kind: "FieldType",
                    differentiate: () => ({kind: "Primitive", loc: ManifestBuilder.loc, val: type})
                }
            }
        })
        return this
    }

    addStructOrEnumField(name: string, isRequired: boolean, typeName: string): this {
        
        this.fields.push({
            kind: "Field",
            loc: ManifestBuilder.loc,
            isRequired,
            name,
            part: {
                FieldType: {
                    kind: "FieldType",
                    differentiate: () => this.parent.get(typeName, "Struct", "Enum")
                }
            }
        })
        return this
    }

    build(): CompiledTypes.Struct {
        const struct: CompiledTypes.Struct ={
            kind: "Struct",
            file: {dir: "", name: "", fullname: ""},
            loc: ManifestBuilder.loc,
            children: {
                Field: this.fields
            },
            name: this.name
        }

        this.parent.map.set(this.name, struct)
        return struct
    }
    
}


class ManifestBuilder {
    static readonly loc = {startColNumber: 0, startLineNumber: 0, endColNumber: 0, endLineNumber: 0}
    static readonly file = {dir: "", name: "", fullname: ""}
    readonly map = new Map()

    
    struct(name: string): StructBuilder {
        return new StructBuilder(name, this)
    }
    
    store(name: string, stores: string) {
        const store: CompiledTypes.Store = {
            kind: "StoreDefinition",
            loc: ManifestBuilder.loc,
            name,
            stores: this.get(stores, "Struct")
        }
        this.map.set(name, store)
    }

    get(name: string, ...kinds: string[]): any {
        const type = this.map.get(name)
        if (type === undefined || !(kinds.includes(type.kind))) {
            throw Error(`TEST BUG: ${type} is not ${kinds}`)
        }
        return type
    }

    build(): CompiledTypes.Manifest {

        return {
            namespace: {
                name: "default",
                inScope: new CompiledTypes.EntityMap(this.map)
            },
            service: {
                kind: "public",
                functions: []
            }
        }
    }
}
