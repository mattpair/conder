import compile from "../main/compile"


function protoCompileTest(description, file: string) {
    test(description, () => {
        expect(compile(file)).toMatchSnapshot()
    })
} 

protoCompileTest("should convert simple conduit into proto2",
`
    message MyMessage {
        double d = 1;
        float f = 2;
        int32 i32 = 3;
        int64 I = 4;
        uint32 u32 = 5;
        uint64 u64 = 6;
        sint32 s32 = 7;
        sint64 s64 = 8;
        fixed32 f32 = 9;
        fixed64 f64 = 10;
        sfixed32 sf32 = 11;
        sfixed64 sf64 = 12;
        bool b = 13;
        string s = 14;
        bytes bs = 15;
    }`
)

protoCompileTest("should convert multiple conduit into proto2", `
    message m1 {
        double d = 1;
        float f = 2;
        int32 i32 = 3;
        int64 I = 4;
        uint32 u32 = 5;
        uint64 u64 = 6;
    }
    message m2{
        sint32 s32 = 7;
        sint64 s64 = 8;
        fixed32 f32 = 9;
        fixed64 f64 = 10;
        sfixed32 sf32 = 11;
        sfixed64 sf64 = 12;
        bool b = 13;
        string s = 14;
        bytes bs = 15;
    }
    `)

protoCompileTest("should allow one message to reference another", `
    message m1 {
        double d = 1;
        float f = 2;
        int32 i32 = 3;
        int64 I = 4;
        uint32 u32 = 5;
        uint64 u64 = 6;
    }
    message m2{
        sint32 s32 = 7;
        m1 myMessage =1;
    }
    `)

protoCompileTest("should allow the specification of required fields", `
    message MyMessage {
        required double d = 1;
        required float f = 2;
        required int32 i32 = 3;
        required int64 I = 4;
        required uint32 u32 = 5;
        required uint64 u64 = 6;
        required sint32 s32 = 7;
        required sint64 s64 = 8;
        required fixed32 f32 = 9;
        required fixed64 f64 = 10;
        required sfixed32 sf32 = 11;
        required sfixed64 sf64 = 12;
        required bool b = 13;
        required string s = 14;
        required bytes bs = 15;
    }
    `)

protoCompileTest("should allow enums",`
    enum PurchaseCategory {
        UNCATEGORIZED=0;
        GAS=1;
        DINING=2;
        TRAVEL=3;
        GROCERY=4;
        ENTERTAINMENT=5;
    }
    `)