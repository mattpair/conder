import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes, Lexicon } from "conduit_compiler"

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

    build(): CompiledTypes.Struct {
        const struct: CompiledTypes.Struct ={
            kind: "Struct",
            file: {dir: "", name: "", fullname: ""},
            loc: ManifestBuilder.loc,
            children: {
                Field: [
                    {
                        loc: ManifestBuilder.loc, 
                        kind: "Field", 
                        isRequired: true,
                        name: "onlyField",
    
                        part: {
                            FieldType: {
                                kind: "FieldType",
                                differentiate: () => ({loc: ManifestBuilder.loc, kind: "Primitive", val: Lexicon.Symbol.bool})
                                
                            }
                        }
                    }]
            },
            name: "test"
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

async function runCodeGenTest(manifest: CompiledTypes.Manifest): Promise<void> {
    const r = await writeRustAndContainerCode.func({manifest})
    const mainFiles = r.backend.main.files.filter(f => !(/Cargo/.test(f.name)))
    expect(mainFiles).toMatchSnapshot("main files")
    expect(r.backend.postgres.files).toMatchSnapshot("postgres files")
}


test("empty everything", async () => {
    runCodeGenTest({
        namespace: {
            name: "default",
            inScope: new CompiledTypes.EntityMap(new Map())
        },
        service: {
            kind: "public",
            functions: []
        }
    })
})


test("only one struct", async () => {
    const entBuilder = new ManifestBuilder()
    entBuilder.struct("test").addPrimitiveField("onlyField", true, Lexicon.Symbol.bool).build()
    

    runCodeGenTest(entBuilder.build())
})