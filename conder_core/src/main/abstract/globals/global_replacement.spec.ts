import { MONGO_GLOBAL_ABSTRACTION_REMOVAL, AnyNode, AbstractNodes } from "../../../../index"
import { FunctionDescription } from "../function"


describe("mongo", () => {

    function replaceTest(original: Exclude<AnyNode, AbstractNodes>): jest.ProvidesCallback {
        return (cb) => {
            const map = new Map<string, FunctionDescription>().set("func", {   
                // Typically, a root node is required so you express a meaningful computation.
                // However, it would make tests more verbose here and the abstraction remover
                // is capable of handling any type of node.
                computation: [original] as any, 
                input: []
            })
            expect(MONGO_GLOBAL_ABSTRACTION_REMOVAL.run(map)).toMatchSnapshot()
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