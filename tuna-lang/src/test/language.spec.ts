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

    it("should allow return statements within functions",
    tunaTest("succeed", `public function returny() {
        return
    }`))

    it("should allow setting of keys on a global object", 
    
        tunaTest("succeed",
        `
        const gg = {}
        public function fff(a) {
            gg.abc = a
            gg[a] = a
            gg['abc'] = a
        }
        `)
    )

    it("should allow getting of nested keys",
    
        tunaTest("succeed",
        `
        const gg = {}
        public function fff(a) {
            return gg[a].field
        }
        `)
    )

    it('should allow bools, numbers, and strings', tunaTest("succeed", `
    
    public function fff(a) {
        true
        false
        12
        -12.12
        'hello world'
        {}
    }
    
    `))

    it('can declare temp variables', tunaTest("succeed", `
    
    public function fff(a) {
        const b = true
        let c = false
        const d = a[b]
    }
    
    `))
})