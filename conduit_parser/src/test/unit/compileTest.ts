import {compileFiles} from '../../main/compile'

function compileTest(description: string, file: string) {
    test(description, () => {
        expect(compileFiles({"testFile.cdt": () => file})).toMatchSnapshot()
    })
} 

//TODO: update names
compileTest("should convert simple conduit into manifest",
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

compileTest("should convert multiple conduit into manifest", `
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

compileTest("should allow one struct to reference another", `
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

compileTest("should allow the specification of optional fields", `
    struct Mystruct {
        d: Optional<double>
        f: Optional<float>
        i32: Optional<int32>
        I: Optional<int64>
        u32: Optional<uint32>
        u64: Optional<uint64>
        b: Optional<bool>
        s: Optional<string>
        bs: Optional<bytes>
    }
    `)

compileTest("should allow enums",`
    enum PurchaseCategory {
        UNCATEGORIZED,
        GAS,
        DINING,
        TRAVEL,
        GROCERY,
        ENTERTAINMENT,
    }
    `)

compileTest("should allow enums separated by whitespace",`
    enum PurchaseCategory {
        UNCATEGORIZED
        GAS
        DINING
        TRAVEL
        GROCERY
        ENTERTAINMENT
    }
    `)


compileTest("should allow multiple enums separated by whitespace",`
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

compileTest("defining a store", `
    struct stored {
        s: string
    }

    myFirstStore: Array<stored> = []
`)

compileTest("getting all data from store", `
    struct stored {
        s: string
    }

    secondStore: Array<stored> = []

    function getAllData() Array<stored> {
        return secondStore
    }
`)

compileTest("functions have flexible syntax", `
    struct stored {
        s: string
    }

    secondStore: Array<stored> = []

    function getAllData(): Array<stored> {
        return secondStore
    }
`)