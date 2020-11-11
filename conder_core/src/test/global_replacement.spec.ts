import { make_replacer, MONGO_REPLACER } from "../../index"


describe("mongo", () => {
    const replace = make_replacer(MONGO_REPLACER)

    it("get field with mongo specific op", () => {
        expect(replace({
            kind: "GetField",
            target: {kind: "GlobalObject", name: "global"},
            field_name: [{kind: "String", value: "field"}]
        })).toMatchSnapshot()
    })
})