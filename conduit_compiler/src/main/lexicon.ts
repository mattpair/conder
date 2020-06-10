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
    as="as",
    FUCTION_DECLARATION="Function Declaration",
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