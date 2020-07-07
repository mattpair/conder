import {compileFiles} from "../../main/compile"


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
    message m1 {
        double d
    }
    `,

    "conduit_b.cdt": `
    import 'conduit_a.cdt' as A

    message m2 {
        double d
    }
    message m1 {
        m2 m
    }
    `
})

protoCompileTest("dependency multi file", {
    "conduit_a.cdt": `
    message m1 {
        double d
    }
    `,

    "conduit_b.cdt": `
    import 'conduit_a.cdt' as A

    message m2 {
        A.m1 m
    }
    `
})

testFailsWhen("circular dependency", {
    "conduit_a.cdt": `
    import 'conduit_b.cdt' as B
    message m1 {
        double d
    }
    `,

    "conduit_b.cdt": `
    import 'conduit_a.cdt' as A
    message m2 {
        double d
    }
    `

})

protoCompileTest("dependency subdirs", {
    "conduit_a.cdt": `
    message m1 {
        double d
    }
    `,

    "conduit_d.cdt": `
    import 'sub/conduit_c.cdt' as C
    message D {
        C.m2 d
    }
    `,

    "sub/conduit_b.cdt": `
    import 'conduit_a.cdt' as A

    message m2 {
        A.m1 m
    }
    `,

    "sub/conduit_c.cdt": `
    import 'conduit_a.cdt' as A
    import './conduit_b.cdt' as B

    message m2 {
        A.m1 m1
        B.m2 m2
    }
    `
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

testFailsWhen("function with void returns type", {
    "conduit_a.cdt": `

    message SomeType {
        string m
    }

    function funk(a: SomeType) {
        return a
    }
    `
})

testFailsWhen("function with type return returns none", {
    "conduit_a.cdt": `

    message SomeType {
        string m
    }

    function funk() SomeType {
    }
    `
})

protoCompileTest("simple echo function", {
    "conduit_a.cdt": `

    message Shout {
        string m
    }

    function echo(s: Shout) Shout {
        return s
    }
    `
})

testFailsWhen("subdir isn't referenced in present dir", {
    "conduit_a.cdt": `
    import 'conduit_b.cdt' as B
    message m1 {
        double d
    }
    `,

    "conduit_b.cdt": `
    import 'conduit_c.cdt' as C
    message m2 {
        double d
    }
    `,

    "sub/conduit_c.cdt": `

    message m2 {
        double m1
    }
    `

})