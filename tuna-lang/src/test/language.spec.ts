import { Parser } from '../main/parser';


describe("language", () => {

    function tunaTest(maybeSucceed: "succeed" | "fail", code: string): jest.ProvidesCallback {
        return (cb) => {
            if (maybeSucceed === "succeed") {
                const p = new Parser(code)
                const r = p.parse()
                expect(r).toMatchSnapshot()
            }
            cb()
        }
    }

    it("should allow a global object", tunaTest("succeed", `const obj = {}`))
        

    it("should allow many global objects",
        tunaTest("succeed", `
        const obj1 = {}
        const obj2 = {}
        `)
    )

    it("should allow empty public functions", 
    tunaTest("succeed", `public function doSomething() {}`))

    it("should allow a fixed number of args in functions",
    tunaTest("succeed", `public function argy(a, b, c) {
        
    }`)
    )
})