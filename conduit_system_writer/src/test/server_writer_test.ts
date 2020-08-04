import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes } from "conduit_compiler"

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