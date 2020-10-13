import { PrimitiveUnion, Symbol } from './lexicon';


export type SchemaType = "Optional" | "Object" | "Array" | PrimitiveUnion | "Ref"

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
    string: { kind: Symbol.string, data: null },
    bool: { kind: Symbol.bool, data: null},
    double: { kind: Symbol.double, data: null },
    int: { kind: Symbol.int, data: null },
    Ref: (r) => ({kind: "Ref", data: [r]})
};


export type SchemaInstance<P extends SchemaType> = P extends PrimitiveUnion ? { kind: P; data: undefined} : 
P extends "Object" ? { kind: "Object"; data: Record<string, SchemaInstance<SchemaType>>; } : 
P extends "Optional" ? { kind: "Optional"; data: [SchemaInstance<SchemaType>]; } : 
P extends "Array" ? { kind: "Array"; data: [SchemaInstance<SchemaType>]; } :
P extends "Ref" ? {kind: "Ref", data: [SchemaInstance<SchemaType>]} : never;

export type AnySchemaInstance = SchemaInstance<SchemaType>
export type Schemas = AnySchemaInstance[]