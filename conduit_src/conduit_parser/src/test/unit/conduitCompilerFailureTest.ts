import {compileFiles} from '../../main/compile'

function testFailsWhen(description: string, file: string) {
    test(description, () => {
        expect(() => compileFiles({"badFile.cdt": () => file}, {dependents: {}, project: "test", install: []})).toThrowErrorMatchingSnapshot()
    })
}

testFailsWhen("dependent struct is not in scope ", `
struct m1 {
    m2: M2
}
`)

testFailsWhen("naming an entity after a keyword ", `
struct function {
    i: int32
}
`)

testFailsWhen("attempting to store enums", `
enum AttemptToStore {
    Yes,
    No
}

myBadStore: Array<AttemptToStore> = []
`)

testFailsWhen("attempting to store non-array", `

struct Singleton {
    value: string 
}

singletonStore: Singleton = []


`)


testFailsWhen("creating an optional enum", `

enum MyEnum {
    A,
    B
}
struct Container {
    e: Optional<MyEnum>
}

`)

testFailsWhen("creating an optional array", `

struct Container {
    e: Optional<Array<int32>>
}

`)

testFailsWhen("creating an array optional", `

struct Container {
    e: Array<Optional<int32>>
}

`)