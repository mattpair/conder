import {compileFiles} from '../../main/compile'

function testFailsWhen(description: string, file: string) {
    test(description, () => {
        expect(() => compileFiles({"badFile.cdt": () => file})).toThrowErrorMatchingSnapshot()
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


testFailsWhen("not returning anything", `

struct Singleton {
    value: string
}

function echosSingleton(s: Singleton) Singleton {
    s
}
`)