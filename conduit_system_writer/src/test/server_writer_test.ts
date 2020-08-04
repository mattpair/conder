import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes, Lexicon } from "conduit_compiler"

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
    const loc = {startColNumber: 0, startLineNumber: 0, endColNumber: 0, endLineNumber: 0}
    const struct: CompiledTypes.Struct = {
        kind: "Struct",
        file: {dir: "", name: "", fullname: ""},
        loc,
        children: {
            Field: [
                {
                    loc, 
                    kind: "Field", 
                    isRequired: true,
                    name: "onlyField",

                    part: {
                        FieldType: {
                            kind: "FieldType",
                            differentiate: () => ({loc, kind: "Primitive", val: Lexicon.Symbol.bool})
                            
                        }
                    }
                }]
        },
        name: "test"
    }
    const map = new Map()
    map.set("test", struct)

    runCodeGenTest({
        namespace: {
            name: "default",
            inScope: new CompiledTypes.EntityMap(map)
        },
        service: {
            kind: "public",
            functions: []
        }
    })
})