import {compileFiles} from "../../main/compile"


function protoCompileTest(description: string, file: string) {
    test(description, () => {
        expect(compileFiles({"testFile.cdt": () => file})).toMatchSnapshot()
    })
} 

protoCompileTest("should convert simple conduit into proto2",
`
    struct Mystruct {
        double d,
        float f,
        int32 i32,
        int64 I,
        uint32 u32,
        uint64 u64,
        bool b,
        string s,
        bytes bs,
    }`
)

protoCompileTest("should convert multiple conduit into proto2", `
    struct m1 {
        double d,
        float f,
        int32 i32,
        int64 I,
        uint32 u32,
        uint64 u64,
    }
    struct m2{
        bool b,
        string s,
        bytes bs,
    }
    `)

protoCompileTest("should allow one struct to reference another", `
    struct m1 {
        double d,
        float f,
        int32 i32,
        int64 I,
        uint32 u32,
        uint64 u64,
    }
    struct m2{
        m1 myMessag,
    }
    `)

protoCompileTest("should allow the specification of optional fields", `
    struct Mystruct {
        optional double d,
        optional float f,
        optional int32 i32,
        optional int64 I,
        optional uint32 u32,
        optional uint64 u64,
        optional bool b,
        optional string s,
        optional bytes bs,
    }
    `)

protoCompileTest("should allow new line to end field", `
    struct Mystruct {
        optional double d
        float f
        optional int32 i32
        optional int64 I
        optional uint32 u32
        optional uint64 u64
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

protoCompileTest("defining a store", `
    struct stored {
        string s
    }

    myFirstStore = new Store<stored>
`)

protoCompileTest("getting all data from store", `
    struct stored {
        string s
    }

    secondStore = new Store<stored>

    function getAllData() stored[] {
        return all in secondStore
    }
`)