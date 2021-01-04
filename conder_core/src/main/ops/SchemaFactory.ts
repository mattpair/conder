

export type SchemaType = "Object" | "Array"| "Any" | "Role" | "Union" | "none" | "Map" | PrimitiveUnion

type SchemaFactory = Readonly<{
    [P in Exclude<SchemaType, PrimitiveUnion | "Any" | "none">]: 
    P extends "Role" ? (name: string, r: SchemaInstance<"Object">) => SchemaInstance<"Role"> :
    P extends "Union" ? (options: SchemaInstance<SchemaType>[]) => SchemaInstance<P> :
    P extends "Object" ? (r: Record<string, SchemaInstance<SchemaType>>) => SchemaInstance<P> : (i: SchemaInstance<SchemaType>) => SchemaInstance<P>;
} & {
        [P in PrimitiveUnion | "Any" | "none"]: SchemaInstance<P>;
    }>;


export const schemaFactory: SchemaFactory = {
    Object: (r) => ({ kind: "Object", data: r }),
    Role: (name, sch) => ({ kind: "Role", data: [name, [sch]] }),
    Array: (r) => ({ kind: "Array", data: [r] }),
    Union: (data) => ({kind: 'Union', data}),
    Map: (s) => ({kind: "Map", data: [s]}),
    Any: {kind: "Any", data: null},
    string: { kind: "string", data: null },
    bool: { kind: "bool", data: null},
    double: { kind: "double", data: null },
    int: { kind: "int", data: null },
    none: {kind: "none", data: null}
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


export type SchemaInstance<P extends SchemaType> = P extends PrimitiveUnion | "Any" | "none" ? { kind: P; data: undefined} : 
P extends "Object" ? { kind: "Object"; data: Record<string, SchemaInstance<SchemaType>>; } : 
P extends "Map" ? { kind: "Map"; data: [SchemaInstance<SchemaType>]; } : 
P extends "Optional" ? { kind: "Optional"; data: [SchemaInstance<SchemaType>]; } : 
P extends "Array" ? { kind: "Array"; data: [SchemaInstance<SchemaType>]; } :
P extends "Role" ? {kind: "Role", data: [string, [SchemaInstance<"Object">]]} :
P extends "Union" ? {kind: "Union",  data: SchemaInstance<SchemaType>[]}:
never;

export type AnySchemaInstance = SchemaInstance<SchemaType>
export type Schemas = AnySchemaInstance[]