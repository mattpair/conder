import {compileFiles} from "../main/compileToProto"


function protoCompileTest(description, files: Record<string, string>) {
    test(description, () => {

        const lazyFiles: Record<string, () => string> = {}
        for (const file in files) {
            lazyFiles[file] = () => files[file]
        }
        expect(compileFiles(lazyFiles)).toMatchSnapshot()
    })
} 


protoCompileTest("simple multi file", {
    "conduit_a.cdt": `
    message m1 {
        double d
    }
    `,

    "conduit_b.cdt": `
    import conduit_a

    message m2 {
        double d
    }
    `
})