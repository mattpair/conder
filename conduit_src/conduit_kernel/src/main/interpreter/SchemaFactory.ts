import { Lexicon } from 'conduit_parser';

export type SchemaType = "Optional" | "Object" | "Array" | Lexicon.PrimitiveUnion

type SchemaFactory = Readonly<{
    [P in Exclude<SchemaType, Lexicon.PrimitiveUnion>]: P extends "Object" ? (r: Record<string, SchemaInstance<SchemaType>>) => SchemaInstance<P> : (i: SchemaInstance<SchemaType>) => SchemaInstance<P>;
} & {
        [P in Lexicon.PrimitiveUnion]: SchemaInstance<P>;
    }>;


export const schemaFactory: SchemaFactory = {
    Object: (r) => ({ kind: "Object", data: r }),
    Array: (r) => ({ kind: "Array", data: [r] }),
    Optional: (r) => ({ kind: "Optional", data: [r] }),
    string: { kind: Lexicon.Symbol.string },
    bool: { kind: Lexicon.Symbol.bool },
    double: { kind: Lexicon.Symbol.double },
    int: { kind: Lexicon.Symbol.int },
};

export type SchemaInstance<P extends SchemaType> = P extends Lexicon.PrimitiveUnion ? { kind: P; } : P extends "Object" ? { kind: "Object"; data: Record<string, SchemaInstance<SchemaType>>; } : P extends "Optional" ? { kind: "Optional"; data: [SchemaInstance<SchemaType>]; } : P extends "Array" ? { kind: "Array"; data: [SchemaInstance<SchemaType>]; } : never;
