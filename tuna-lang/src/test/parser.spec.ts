import { Parser } from '../main/parser';


describe("parser", () => {
    it("should parse a global object", () => {
        const p = new Parser(`const obj = {}`)
        const r = p.parse()
        expect(r).toMatchSnapshot()
    })

    it("should parse many global objects", () => {
        const p = new Parser(
        `
        const obj1 = {}
        const obj2 = {}
        `)
        const r = p.parse()
        expect(r).toMatchSnapshot()
    })
})