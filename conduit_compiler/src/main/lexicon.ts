export enum Symbol {
    message="message",
    optional="optional",
    enum="enum",
    EQ="=",
    SEMI=";",
    OPEN_BRACKET="{",
    CLOSE_BRACKET="}",
    COMMA=",",
    double="double",
    float="float",
    int32="int32",
    int64="int64",
    uint32="uint32",
    uint64="uint64",
    sint32="sint32",
    sint64="sint64",
    fixed32="fixed32",
    fixed64="fixed64",
    sfixed32="sfixed32",
    sfixed64="sfixed64",
    bool="bool",
    string="string",
    bytes="bytes",
    NEW_LINE="\\n",
    import="import",
    VARIABLE_NAME="VariableName",
    NUMBER_LITERAL="NumberLiteral",
    STRING_LITERAL="StringLiteral",
    VARIABLE_MEMBER_ACCESS="VarMemberAccess",
    as="as",
    IMPORT_WITH_ALIAS="Import with alias",
}

export const Operators: [
    Symbol.CLOSE_BRACKET, 
    Symbol.OPEN_BRACKET, 
    Symbol.SEMI, 
    Symbol.EQ,
    Symbol.COMMA,
    Symbol.NEW_LINE
] = [
    Symbol.CLOSE_BRACKET, 
    Symbol.OPEN_BRACKET, 
    Symbol.SEMI, 
    Symbol.EQ,
    Symbol.COMMA,
    Symbol.NEW_LINE
]

export type PrimitiveUnion = 
    Symbol.double |
    Symbol.float |
    Symbol.int32 |
    Symbol.int64 |
    Symbol.uint32 |
    Symbol.uint64 |
    Symbol.sint32 |
    Symbol.sint64 |
    Symbol.fixed32 |
    Symbol.fixed64 |
    Symbol.sfixed32 |
    Symbol.sfixed64 |
    Symbol.bool |
    Symbol.string |
    Symbol.bytes

export const Primitives: PrimitiveUnion[] = [
    Symbol.double,
    Symbol.float,
    Symbol.int32,
    Symbol.int64,
    Symbol.uint32,
    Symbol.uint64,
    Symbol.sint32,
    Symbol.sint64,
    Symbol.fixed32,
    Symbol.fixed64,
    Symbol.sfixed32,
    Symbol.sfixed64,
    Symbol.bool,
    Symbol.string,
    Symbol.bytes,
]

export type AnyKeyword = 
Symbol.message |
Symbol.optional | 
Symbol.enum 

export const Keywords: AnyKeyword[] = [
    Symbol.message,
    Symbol.optional,
    Symbol.enum,
]

export enum Dynamic {
    Variable,
    Number
}

const SymbolRegexesMaker: () => Record<Symbol, RegExp> = () => {
    const r = {}
    Operators.forEach(op => {
        r[op] =  new RegExp(`^(?<val>${op})`)
    });

    Primitives.forEach(p => {
        r[p] = new RegExp(`^(?<val>${p})\\s`)
    })

    Keywords.forEach(k => {
        r[k] = new RegExp(`^(?<val>${k})\\s`)
    })
    r[Symbol.NUMBER_LITERAL] = new RegExp(/^(?<val>\d+)/)
    r[Symbol.VARIABLE_NAME] =  /^(?<val>[_A-Za-z]+[\w]*)/
    r[Symbol.STRING_LITERAL] = /^'(?<val>.*)'/
    r[Symbol.VARIABLE_MEMBER_ACCESS] = /^(?<from>[_A-Za-z]+[\w]*)\.(?<type>[_A-Za-z]+[\w]*)/
    r[Symbol.IMPORT_WITH_ALIAS] = /^import +'(?<location>[\w \.\/]*)' +as +(?<alias>[_A-Za-z]+[\w]*)/
    let a = /(?<mycap>[abcdef]*)/
    let b = a.exec("a")
    b.groups
    return r as Record<Symbol, RegExp>
}

export const SymbolToRegex: Record<Symbol, RegExp> = SymbolRegexesMaker()