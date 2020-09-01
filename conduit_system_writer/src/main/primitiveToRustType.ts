import { CompiledTypes, Lexicon, Utilities } from 'conduit_parser';
export function primitiveToRustType(type: Lexicon.PrimitiveUnion): string {
    switch (type) {
        case Lexicon.Symbol.double:
            return "f64";

        case Lexicon.Symbol.float:
            return "f32";

        case Lexicon.Symbol.int32:
            return "i32";

        case Lexicon.Symbol.int64:
            return "i64";

        case Lexicon.Symbol.string:
            return "String";

        case Lexicon.Symbol.uint32:
            return "i32";

        case Lexicon.Symbol.uint64:
            return "i64";

        case Lexicon.Symbol.bool:
            return "bool";


        case Lexicon.Symbol.bytes:
            return "Vec<u8>";

        default: Utilities.assertNever(type);
    }
}
