import {compileFiles} from "../main/compileToProto"


function protoCompileTest(description, file: string) {
    test(description, () => {
        expect(compileFiles({"testFile.cdt": () => file})).toMatchSnapshot()
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

protoCompileTest("should allow the specification of optional fields", `
    message MyMessage {
        optional double d,
        optional float f,
        optional int32 i32,
        optional int64 I,
        optional uint32 u32,
        optional uint64 u64,
        optional sint32 s32,
        optional sint64 s64,
        optional fixed32 f32,
        optional fixed64 f64,
        optional sfixed32 sf32,
        optional sfixed64 sf64,
        optional bool b,
        optional string s,
        optional bytes bs,
    }
    `)

protoCompileTest("should allow new line to end field", `
    message MyMessage {
        optional double d
        float f
        optional int32 i32
        optional int64 I
        optional uint32 u32
        optional uint64 u64
        sint32 s32
        optional sint64 s64
        optional fixed32 f32
        optional fixed64 f64
        optional sfixed32 sf32
        optional sfixed64 sf64
        optional bool b
        optional string s
        optional bytes bs
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

protoCompileTest("should allow enums separated by whitespace",`
    enum PurchaseCategory {
        UNCATEGORIZED
        GAS
        DINING
        TRAVEL
        GROCERY
        ENTERTAINMENT
    }
    `)


protoCompileTest("should allow multiple enums separated by whitespace",`
    enum PurchaseCategory {
        UNCATEGORIZED
        GAS
        DINING
        TRAVEL
        GROCERY
        ENTERTAINMENT
    }
    
    enum OtherCategories {
        A
        B
        C
    }
    `)