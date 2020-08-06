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

TestCodeGen("store containing struct containing array", `
struct inner {
    int32 fieldA
}

struct outer {
    inner[] inners
}

outerStore: outer[] = []

`)

TestCodeGen("inserting simple struct", `
struct simple {
    double data
}

simpleStore: simple[] = []

function insert(s: simple) {
    simpleStore.append(s)
}
`)

TestCodeGen("inserting struct containing struct", `
struct simple {
    bool data
}

struct wrapper {
    simple innard
}

wrapStore: wrapper[] = []

function insert(s: wrapper) {
    wrapStore.append(s)
}
`)

TestCodeGen("inserting struct containing struct containing primitive array", `
struct simple {
    string[] data
}

struct wrapper {
    simple innard
}

wrapStore: wrapper[] = []

function insert(s: wrapper) {
    wrapStore.append(s)
}
`)

// TestCodeGen("inserting struct containing struct array", `
// struct simple {
//     string data
// }

// struct wrapper {
//     simple[] innard
// }

// wrapStore: wrapper[] = []

// function insert(s: wrapper) {
//     wrapStore.append(s)
// }
// `)