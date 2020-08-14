import { deriveSupportedOperations } from './../main/server_writer';
import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes, Lexicon, compileFiles, Utilities } from "conduit_compiler"

function TestCodeGen(description: string, conduit: string) {
    test(description, async () => {
        const manifest = compileFiles({test: () => conduit})
        const r = await new Utilities.Sequence(deriveSupportedOperations)
        .then(writeRustAndContainerCode)
        .run({manifest})
        const mainFiles = r.backend.main.files.filter(f => !(/Cargo/.test(f.name)))
        expect(mainFiles).toMatchSnapshot("main files")
        expect(r.backend.postgres.files).toMatchSnapshot("postgres files")
    })
}

TestCodeGen("simple struct", `
struct simple {
    data:double 
}

simpleStore: Array<simple> = []

function insert(s: simple) {
    simpleStore.append(s)
}

function get() Array<simple> {
    return simpleStore
}
`)

TestCodeGen("struct containing struct", `
struct simple {
    data: bool 
}

struct wrapper {
    innard: simple 
}

wrapStore: Array<wrapper> = []

function insert(s: wrapper) {
    wrapStore.append(s)
}

function get() Array<wrapper> {
    return wrapStore
}
`)

TestCodeGen("struct containing struct containing primitive array", `
struct simple {
    data: Array<string>
}

struct wrapper {
    innard: simple 
}

wrapStore: Array<wrapper> = []

function insert(s: wrapper) {
    wrapStore.append(s)
}

function get() Array<wrapper> {
    return wrapStore
}
`)

TestCodeGen("inserting struct containing struct array", `
struct simple {
    data: string 
}

struct wrapper {
    innard: Array<simple>
}

wrapStore: Array<wrapper> = []

function insert(s: wrapper) {
    wrapStore.append(s)
}
`)

TestCodeGen("inserting struct containing struct array", `
struct simple {
    data: string 
}

struct wrapper {
    innard: Array<simple>
}

wrapStore: Array<wrapper> = []

function insert(s: wrapper) {
    wrapStore.append(s)
}

function get() Array<wrapper> {
    return wrapStore
}
`)