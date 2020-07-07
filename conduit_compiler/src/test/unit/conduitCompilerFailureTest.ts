import {compileFiles} from "../../main/compile"

function testFailsWhen(description: string, file: string) {
    test(description, () => {
        expect(() => compileFiles({"badFile.cdt": () => file})).toThrowErrorMatchingSnapshot()
    })
}

testFailsWhen("dependent message is not in scope ", `
message m1 {
    M2 m2
}
`)

testFailsWhen("naming an entity after a keyword ", `
message function {
    int32 i
}
`)