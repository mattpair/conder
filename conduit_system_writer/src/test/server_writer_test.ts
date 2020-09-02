import { functionToByteCode } from './../main/statement_converter';
import { deriveSupportedOperations } from './../main/interpreter/derive_supported_ops';
import { writeRustAndContainerCode } from "../main/server_writer"
import { CompiledTypes, Lexicon, compileFiles, Utilities } from "conduit_parser"

function testBody(conduit: string) {
    const manifest = compileFiles({test: () => conduit})
    return new Utilities.Sequence(deriveSupportedOperations)
    .then(functionToByteCode)
    .then(writeRustAndContainerCode)
    .run({manifest})
    
   
}


function TestCodeGen(description: string, conduit: string) {
    test(description, async () => {
        const r = await testBody(conduit)
        const mainFiles = r.backend.main.files.filter(f => !(/Cargo/.test(f.name)))
        expect(mainFiles).toMatchSnapshot("main files")
        expect(r.backend.postgres.files).toMatchSnapshot("postgres files")
    })
}

function testFailsWhen(description: string, conduit: string) {
    test(description, async () => {
        let err = undefined
        await testBody(conduit).catch(e => {err= e})
        expect(err).toBeDefined()
        expect(err).toMatchSnapshot()
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


testFailsWhen("function with type return returns none", 
    `

    struct SomeType {
        m: string
    }

    function funk() SomeType {
    }
    `
)


testFailsWhen("function with void returns type", 
    `

    struct SomeType {
        m: string
    }

    function funk(a: SomeType) {
        return a
    }
    `
)
testFailsWhen("not returning anything", `

struct Singleton {
    value: string
}

function echosSingleton(s: Singleton) Singleton {
    s
}
`)