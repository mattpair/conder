import {compileFiles} from '../../main/compile'

function makeLazy(files: Record<string, string>): Record<string, () => string> {
    const lazyFiles: Record<string, () => string> = {}
        for (const file in files) {
            lazyFiles[file] = () => files[file]
        }
    return lazyFiles
}

function protoCompileTest(description: string, files: Record<string, string>) {
    test(description, () => {

        expect(compileFiles(makeLazy(files), {dependents: {}, project: "test", install: []})).toMatchSnapshot()
    })
} 

function testFailsWhen(description: string, files: Record<string, string>) {
    test(description, () => {
        expect(() => compileFiles(makeLazy(files),{dependents: {}, project: "test", install: []})).toThrowErrorMatchingSnapshot()
    })
}


protoCompileTest("simple multi file", {
    "conduit_a.cdt": `
    struct m1 {
        d: double
    }
    `,

    "conduit_b.cdt": `

    struct m2 {
        d: double
    }
    struct m3 {
        m: m2
    }
    `
})

protoCompileTest("dependency multi file", {
    "conduit_a.cdt": `
    struct m1 {
        d: double
    }
    `,

    "conduit_b.cdt": `

    struct m2 {
        m:m1
    }
    `
})

testFailsWhen("Self referencing type", {
    "conduit_a.cdt": `
    struct m1 {
        d: m1
    }
    `,

})

testFailsWhen("function with unknown types", {
    "conduit_a.cdt": `
    function letsGetFuncy(a: SomeType, b: Foreign.Type) {

    }

    `
})

testFailsWhen("function with invalid return type", {
    "conduit_a.cdt": `

    function funk() SomeType {
    }
    `
})

protoCompileTest("simple echo function", {
    "conduit_a.cdt": `

    struct Shout {
        m: string
    }

    function echo(s: Shout) Shout {
        return s
    }
    `
})
