export enum Symbol {
    struct="struct",
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
    bool="bool",
    string="string",
    bytes="bytes",
    NEW_LINE="\\n",
    import="import",
    as="as",
    function="function",
    return="return",
    array="\[\]",
    Array="Array",
    Optional="Optional",
    type="type",
    none="none",
    Ref="Ref"
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
export type TypeModifierUnion = Symbol.Array | Symbol.Optional | Symbol.none | Symbol.Ref
export const TypeModifiers: TypeModifierUnion[] = [Symbol.Array, Symbol.Optional, Symbol.none, Symbol.Ref]

export type PrimitiveUnion = 
    Symbol.double |
    Symbol.float |
    Symbol.int32 |
    Symbol.int64 |
    Symbol.uint32 |
    Symbol.uint64 |
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
    Symbol.bool,
    Symbol.string,
    Symbol.bytes,
]

export type AnyKeyword = 
Symbol.struct |
Symbol.optional | 
Symbol.enum |
Symbol.function

export const Keywords: AnyKeyword[] = [
    Symbol.struct,
    Symbol.optional,
    Symbol.enum,
    Symbol.function
]
