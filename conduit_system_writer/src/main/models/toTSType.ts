import { Lexicon, CompiledTypes, Utilities } from 'conduit_parser';

export function toTSType(type: CompiledTypes.ResolvedType, inScope: CompiledTypes.ScopeMap): string {
    let prefix = '';
    let suffix = "";
    switch (type.modification) {
        case "array":
            prefix = "Array<";
            suffix = ">";
            break;

        case "optional":
            suffix = "| null";
        case "none":
            break;
        default: Utilities.assertNever(type.modification);
    }
    switch (type.kind) {
        case "Primitive":
            let primstring = '';
            switch (type.val) {
                case Lexicon.Symbol.bool:
                    primstring = 'boolean';
                    break;
                case Lexicon.Symbol.bytes:
                    throw Error("bytes not yet supported");
                case Lexicon.Symbol.double:
                case Lexicon.Symbol.float:
                case Lexicon.Symbol.int32:
                case Lexicon.Symbol.int64:
                case Lexicon.Symbol.uint32:
                case Lexicon.Symbol.uint64:
                    primstring = 'number';
                    break;
                case Lexicon.Symbol.string:
                    primstring = 'string';
                    break;

                default: Utilities.assertNever(type.val);
            }

            return `${prefix}${primstring}${suffix}`;
        case "CustomType":
            const ent = inScope.getEntityOfType(type.type, "Struct", "Enum");
            return `${prefix}${ent.name}${suffix}`;

        default: Utilities.assertNever(type);
    }

}
