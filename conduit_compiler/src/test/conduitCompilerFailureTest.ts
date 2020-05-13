import compile from "../main/compileToProto"

function testFailsWhen(description, file: string) {
    test(description, () => {
        expect(() => compile(file)).toThrowErrorMatchingSnapshot()
    })
}

testFailsWhen("dependent message is not in scope ", `
message m1 {
    required M2 m2
}
`)