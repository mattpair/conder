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
    onlyField: bool 
}
`)

TestCodeGen("struct containing struct stored", `
struct inner {
    fieldA: double 
}

struct outer {
    inner: inner
}

outerStore: Array outer = []

`)

TestCodeGen("store containing struct containing array", `
struct inner {
    fieldA: int32 
}

struct outer {
    inners: Array inner
}

outerStore: Array outer = []

`)

TestCodeGen("inserting simple struct", `
struct simple {
    data:double 
}

simpleStore: Array simple = []

function insert(s: simple) {
    simpleStore.append(s)
}
`)

TestCodeGen("inserting struct containing struct", `
struct simple {
    data: bool 
}

struct wrapper {
    innard: simple 
}

wrapStore: Array wrapper = []

function insert(s: wrapper) {
    wrapStore.append(s)
}
`)

TestCodeGen("inserting struct containing struct containing primitive array", `
struct simple {
    data: Array string
}

struct wrapper {
    innard: simple 
}

wrapStore: Array wrapper = []

function insert(s: wrapper) {
    wrapStore.append(s)
}
`)

TestCodeGen("inserting struct containing struct array", `
struct simple {
    data: string 
}

struct wrapper {
    innard: Array simple
}

wrapStore: Array wrapper = []

function insert(s: wrapper) {
    wrapStore.append(s)
}
`)