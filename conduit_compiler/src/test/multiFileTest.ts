import {compileFiles} from "../main/compileToProto"


function makeLazy(files: Record<string, string>): Record<string, () => string> {
    const lazyFiles: Record<string, () => string> = {}
        for (const file in files) {
            lazyFiles[file] = () => files[file]
        }
    return lazyFiles
}

function protoCompileTest(description, files: Record<string, string>) {
    test(description, () => {

        expect(compileFiles(makeLazy(files))).toMatchSnapshot()
    })
} 

function testFailsWhen(description, files: Record<string, string>) {
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