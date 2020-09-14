export enum Symbol {
    struct="struct",
    optional="optional",
    enum="enum",
    EQ="=",
    SEMI=";",
    OPEN_BRACKET="{",
    CLOSE_BRACKET="}",
    COMMA=",",
    decimal="decimal",
    int="int",
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
    Symbol.decimal |
    Symbol.bool |
    Symbol.string |
    Symbol.bytes |
    Symbol.int

export const Primitives: PrimitiveUnion[] = [
    Symbol.decimal,
    Symbol.int,
    Symbol.string,
    Symbol.bytes,
    Symbol.bool
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
