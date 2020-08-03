import {compileFiles} from "../../main/compile"

function testFailsWhen(description: string, file: string) {
    test(description, () => {
        expect(() => compileFiles({"badFile.cdt": () => file})).toThrowErrorMatchingSnapshot()
    })
}

testFailsWhen("dependent struct is not in scope ", `
struct m1 {
    M2 m2
}
`)

testFailsWhen("naming an entity after a keyword ", `
struct function {
    int32 i
}
`)

testFailsWhen("attempting to store enums", `
enum AttemptToStore {
    Yes,
    No
}

myBadStore: AttemptToStore[] = []

`)