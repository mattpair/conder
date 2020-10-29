

export type SchemaType = "Optional" | "Object" | "Array" | PrimitiveUnion

type SchemaFactory = Readonly<{
    [P in Exclude<SchemaType, PrimitiveUnion>]: 
    P extends "Object" ? (r: Record<string, SchemaInstance<SchemaType>>) => SchemaInstance<P> : (i: SchemaInstance<SchemaType>) => SchemaInstance<P>;
} & {
        [P in PrimitiveUnion]: SchemaInstance<P>;
    }>;


export const schemaFactory: SchemaFactory = {
    Object: (r) => ({ kind: "Object", data: r }),
    Array: (r) => ({ kind: "Array", data: [r] }),
    Optional: (r) => ({ kind: "Optional", data: [r] }),
    string: { kind: "string", data: null },
    bool: { kind: "bool", data: null},
    double: { kind: "double", data: null },
    int: { kind: "int", data: null },
};

export type TypeModifierUnion = "array" | "optional" | "none"
export const TypeModifiers: TypeModifierUnion[] = ["array", "none", "optional"]

export type PrimitiveUnion = 
    "double" |
    "bool" |
    "string" |
    "int"

export const Primitives: PrimitiveUnion[] = [
    "double",
    "int",
    "string",
    "bool"
]


export type SchemaInstance<P extends SchemaType> = P extends PrimitiveUnion ? { kind: P; data: undefined} : 
P extends "Object" ? { kind: "Object"; data: Record<string, SchemaInstance<SchemaType>>; } : 
P extends "Optional" ? { kind: "Optional"; data: [SchemaInstance<SchemaType>]; } : 
P extends "Array" ? { kind: "Array"; data: [SchemaInstance<SchemaType>]; } :
never;

export type AnySchemaInstance = SchemaInstance<SchemaType>
export type Schemas = AnySchemaInstance[]