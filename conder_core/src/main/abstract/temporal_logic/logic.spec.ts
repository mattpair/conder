import { validate } from "./main"


describe("temporal logic", () => {


    it("allows getting the same piece of data twice if it cannot be mutated", () => {
        expect(validate([
            {kind: "get", id: "i"},
            {kind: "get", id: "i"}
        ], new Map())).toEqual({kind :"success"})
    })

})