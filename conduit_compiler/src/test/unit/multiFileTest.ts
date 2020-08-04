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

        expect(compileFiles(makeLazy(files))).toMatchSnapshot()
    })
} 

function testFailsWhen(description: string, files: Record<string, string>) {
    test(description, () => {
        expect(() => compileFiles(makeLazy(files))).toThrowErrorMatchingSnapshot()
    })
}


protoCompileTest("simple multi file", {
    "conduit_a.cdt": `
    struct m1 {
        double d
    }
    `,

    "conduit_b.cdt": `

    struct m2 {
        double d
    }
    struct m3 {
        m2 m
    }
    `
})

protoCompileTest("dependency multi file", {
    "conduit_a.cdt": `
    struct m1 {
        double d
    }
    `,

    "conduit_b.cdt": `

    struct m2 {
        m1 m
    }
    `
})

testFailsWhen("Self referencing type", {
    "conduit_a.cdt": `
    struct m1 {
        m1 d
    }
    `,

})

protoCompileTest("dependency subdirs", {
    "conduit_a.cdt": `
    struct m1 {
        double d
    }
    `,

    "conduit_d.cdt": `

    struct D {
        m2 my_m2
    }
    `,

    "sub/conduit_b.cdt": `

    struct m2 {
        m1 m
    }
    `,

    "sub/conduit_c.cdt": `
    

    struct m3 {
        m1 m1
        m2 m2
    }
    `
})

testFailsWhen("function with unknown types", {
    "conduit_a.cdt": `
    function letsGetFuncy(a: SomeType, b: Foreign.Type) {

    }

    `
})

testFailsWhen("attempted import", {
    "conduit_a.cdt": `
    import 'conduit_b.cdt' as c
    
    struct m2 {
        c.m1 m
    }

    `
})

testFailsWhen("function with invalid return type", {
    "conduit_a.cdt": `

    function funk() SomeType {
    }
    `
})

testFailsWhen("function with void returns type", {
    "conduit_a.cdt": `

    struct SomeType {
        string m
    }

    function funk(a: SomeType) {
        return a
    }
    `
})

testFailsWhen("function with type return returns none", {
    "conduit_a.cdt": `

    struct SomeType {
        string m
    }

    function funk() SomeType {
    }
    `
})

protoCompileTest("simple echo function", {
    "conduit_a.cdt": `

    struct Shout {
        string m
    }

    function echo(s: Shout) Shout {
        return s
    }
    `
})
