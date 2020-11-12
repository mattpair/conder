import { Parser } from '../main/parser';


describe("parser", () => {
    it("should parse a global object", () => {
        const p = new Parser(`const obj = {}`)
        const r = p.parse()
        expect(r).toMatchSnapshot()
    })
})