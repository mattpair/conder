import {compileFiles} from '../../main/compile'

function protoCompileTest(description: string, file: string) {
    test(description, () => {
        expect(compileFiles({"testFile.cdt": () => file})).toMatchSnapshot()
    })
} 

//TODO: update names
protoCompileTest("should convert simple conduit into proto2",
`
    struct Mystruct {
        d: double 
        f: float 
        i32: int32 
        I: int64 
        u32: uint32 
        u64: uint64 
        b: bool 
        s: string 
        bs: bytes 
    }`
)

protoCompileTest("should convert multiple conduit into proto2", `
    struct m1 {
        d: double 
        f: float 
        i32: int32 
        I: int64 
        u32: uint32 
        u64: uint64 
    }
    struct m2{
        b: bool 
        s: string 
        bs: bytes 
    }
    `)

protoCompileTest("should allow one struct to reference another", `
    struct m1 {
        d: double 
        f: float 
        i32: int32 
        I: int64 
        u32: uint32 
        u64: uint64 
    }
    struct m2{
        myMessag: m1
    }
    `)

protoCompileTest("should allow the specification of optional fields", `
    struct Mystruct {
        d: Optional double,
        f: Optional float,
        i32: Optional int32,
        I: Optional int64,
        u32: Optional uint32,
        u64: Optional uint64,
        b: Optional bool,
        s: Optional string,
        bs: Optional bytes,
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
        s: string
    }

    myFirstStore: Array stored = []
`)

protoCompileTest("getting all data from store", `
    struct stored {
        s: string
    }

    secondStore: Array stored = []

    function getAllData() Array stored {
        return secondStore
    }
`)