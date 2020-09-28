import {compileFiles} from '../../main/compile'

function compileTest(description: string, file: string) {
    test(description, () => {
        expect(compileFiles({"testFile.cdt": () => file}, {dependents: {}, project: "test"})).toMatchSnapshot()
    })
} 

//TODO: update names
compileTest("should convert simple conduit into manifest",
`
    struct Mystruct {
        d: double 
        i: int 
        b: bool 
        s: string 
    }`
)

compileTest("should convert multiple conduit into manifest", `
    struct m1 {
        d: double 
        i: int 
    }
    struct m2{
        b: bool 
        s: string 
    }
    `)

compileTest("should allow one struct to reference another", `
    struct m1 {
        d: double  
        i: int  
    }
    struct m2{
        myMessag: m1
    }
    `)

compileTest("should allow the specification of optional fields", `
    struct Mystruct {
        d: Optional<double>
        i: Optional<int>
        b: Optional<bool>
        s: Optional<string>
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

compileTest("May assign stores and inputs to variables", `
    struct stored {
        s: string
    }

    secondStore: Array<stored> = []

    function getAllDataIntermediate(): Array<stored> {
        result: Array<stored> = secondStore
        return result
    }

    function returnInputIntermediate(i: Array<stored>): Array<stored> {
        result: Array<stored> = i
        return result
    }
`)


compileTest("Field referencing", `
    struct Outermost {
        middle: Middle
    }

    struct Middle {
        inner: Innermost
    }
    struct Innermost {
        f: string
    }

    function getAllDataIntermediate(input: Outermost): Innermost {
        return input.middle.inner
    }
`)

compileTest("for in loop", `
    struct Outermost {
        middle: Middle
    }

    struct Middle {
        inner: Innermost
    }
    struct Innermost {
        f: string
    }

    function getAllDataIntermediate(input: Array<Outermost>) {
        for row in input {
            row.middle.inner
        }
        
    }
`)


compileTest("if statement", `
    struct withbool {
        returnLeft: bool,
        left: string,
        right: string
    }

    function getAllDataIntermediate(input: withbool): string {
        if input.returnLeft {
            return input.left
        }
        return input.right
    }
`)


compileTest("select method", `
    struct stored {
        val: string,
    }
    secondStore: Array<stored> = []


    function getAllData(): Array<stored> {
        
        return secondStore.select(row => {
            return row
        })
    }
`)

compileTest("references ", `
    struct stored {
        val: string,
    }
    
    secondStore: Array<stored> = []

    function refTest(r: Ref<secondStore>): Ref<secondStore> {
        return r
    }
`)

compileTest("object literal ", `
    struct obj {
        a: string,
        b: string
    }
    
    function litTest1(): obj {
        return {
            a: c.genString()
            b: c.genString()
        }
    }

    function litTest2(): obj {
        return {a:c.genString(),b:c.genString()}
    }
`)

compileTest("string literal", `
    struct obj {
        a: string
    }
    function t1(): obj {
        return {
            a: \`this is a single line string\`
        }
    }
    function t2(): obj {
        return {
            a: \` this
            is 
            a
            multiline
            string
            \`
        }
    }

`)