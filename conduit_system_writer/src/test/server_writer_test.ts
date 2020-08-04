import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes } from "conduit_compiler"


test("empty everything", async () => {
    const r =await writeRustAndContainerCode.func({manifest: {
        namespace: {
            name: "default",
            inScope: new CompiledTypes.EntityMap(new Map())
        },
        service: {
            kind: "public",
            functions: []
        }
    }})
    const mainFiles = r.backend.main.files.filter(f => !(/Cargo/.test(f.name)))
    expect(r.backend.main.docker).toMatchSnapshot("main dockerfile")
    expect(mainFiles).toMatchSnapshot("main files")
    expect(r.backend.postgres).toMatchSnapshot("postgres files")
})