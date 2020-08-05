import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes, Lexicon, compileFiles } from "conduit_compiler"

function TestCodeGen(description: string, conduit: string) {
    test(description, async () => {
        
        const r = await writeRustAndContainerCode.func({manifest: compileFiles({test: () => conduit})})
        const mainFiles = r.backend.main.files.filter(f => !(/Cargo/.test(f.name)))
        expect(mainFiles).toMatchSnapshot("main files")
        expect(r.backend.postgres.files).toMatchSnapshot("postgres files")
    })
}

TestCodeGen("only one struct", `
struct test {
    bool onlyField
}
`)

TestCodeGen("struct containing struct stored", `
struct inner {
    double fieldA
}

struct outer {
    inner inner
}

outerStore: outer[] = []

`)