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
    int="int",
    bool="bool",
    string="string",
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
    public="public",
    private="private",
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
export type TypeModifierUnion = Symbol.Array | Symbol.Optional | Symbol.none
export const TypeModifiers: TypeModifierUnion[] = [Symbol.Array, Symbol.Optional, Symbol.none]

export type PrimitiveUnion = 
    Symbol.double |
    Symbol.bool |
    Symbol.string |
    Symbol.int

export const Primitives: PrimitiveUnion[] = [
    Symbol.double,
    Symbol.int,
    Symbol.string,
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
