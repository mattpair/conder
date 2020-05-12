import compile from "../main/compileToProto"


function protoCompileTest(description, file: string) {
    test(description, () => {
        expect(compile(file)).toMatchSnapshot()
    })
} 

protoCompileTest("should convert simple conduit into proto2",
`
    message MyMessage {
        double d,
        float f,
        int32 i32,
        int64 I,
        uint32 u32,
        uint64 u64,
        sint32 s32,
        sint64 s64,
        fixed32 f32,
        fixed64 f64,
        sfixed32 sf32,
        sfixed64 sf64,
        bool b,
        string s,
        bytes bs,
    }`
)

protoCompileTest("should convert multiple conduit into proto2", `
    message m1 {
        double d,
        float f,
        int32 i32,
        int64 I,
        uint32 u32,
        uint64 u64,
    }
    message m2{
        sint32 s32,
        sint64 s64,
        fixed32 f32,
        fixed64 f64,
        sfixed32 sf32,
        sfixed64 sf64,
        bool b,
        string s,
        bytes bs,
    }
    `)

protoCompileTest("should allow one message to reference another", `
    message m1 {
        double d,
        float f,
        int32 i32,
        int64 I,
        uint32 u32,
        uint64 u64,
    }
    message m2{
        sint32 s32,
        m1 myMessag,
    }
    `)

protoCompileTest("should allow the specification of required fields", `
    message MyMessage {
        required double d,
        required float f,
        required int32 i32,
        required int64 I,
        required uint32 u32,
        required uint64 u64,
        required sint32 s32,
        required sint64 s64,
        required fixed32 f32,
        required fixed64 f64,
        required sfixed32 sf32,
        required sfixed64 sf64,
        required bool b,
        required string s,
        required bytes bs,
    }
    `)

protoCompileTest("should allow enums",`
    enum PurchaseCategory {
        UNCATEGORIZED,
        GAS,
        DINING,
        TRAVEL,
        GROCERY,
        ENTERTAINMENT,
    }
    `)