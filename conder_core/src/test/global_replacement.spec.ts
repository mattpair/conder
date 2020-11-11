import { make_replacer, MONGO_REPLACER, AnyNode, AbstractNodes } from "../../index"


describe("mongo", () => {
    const replace = make_replacer(MONGO_REPLACER)

    function replaceTest(original: Exclude<AnyNode, AbstractNodes>): jest.ProvidesCallback {
        return (cb) => {
            expect(replace(original)).toMatchSnapshot()
            cb()
        }
    }
    it("get field with mongo specific op", replaceTest({
            kind: "GetField",
            target: {kind: "GlobalObject", name: "global"},
            field_name: [{kind: "String", value: "field"}]
        })
    )

    it("can replace existence checking", replaceTest({   
            kind: "FieldExists",
            value: {kind: "GlobalObject", name: "glob"},
            field: {kind: "String", value: "maybe"}
        })
    )

    it("can replace SetField updates", replaceTest({
        kind: "Update",
        target: {kind: "GlobalObject", name: "gg"},
        operation: {kind: "SetField", value: {kind: "String", value: 'some val'}, field_name: [{kind: "Saved", index: 12}]}
    }))
})