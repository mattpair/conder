import { PrimitiveUnion, Symbol } from './lexicon';


export type SchemaType = "Optional" | "Object" | "Array" | PrimitiveUnion

type SchemaFactory = Readonly<{
    [P in Exclude<SchemaType, PrimitiveUnion>]: P extends "Object" ? (r: Record<string, SchemaInstance<SchemaType>>) => SchemaInstance<P> : (i: SchemaInstance<SchemaType>) => SchemaInstance<P>;
} & {
        [P in PrimitiveUnion]: SchemaInstance<P>;
    }>;


export const schemaFactory: SchemaFactory = {
    Object: (r) => ({ kind: "Object", data: r }),
    Array: (r) => ({ kind: "Array", data: [r] }),
    Optional: (r) => ({ kind: "Optional", data: [r] }),
    string: { kind: Symbol.string },
    bool: { kind: Symbol.bool },
    double: { kind: Symbol.double },
    int: { kind: Symbol.int },
};

export type SchemaInstance<P extends SchemaType> = P extends PrimitiveUnion ? { kind: P; } : P extends "Object" ? { kind: "Object"; data: Record<string, SchemaInstance<SchemaType>>; } : P extends "Optional" ? { kind: "Optional"; data: [SchemaInstance<SchemaType>]; } : P extends "Array" ? { kind: "Array"; data: [SchemaInstance<SchemaType>]; } : never;
