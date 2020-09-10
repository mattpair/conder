import { CompiledTypes, Utilities, Lexicon } from 'conduit_parser';
import { extractRefStructName } from './type_writing/extractRefStructName';
export function toInterpreterType(p: CompiledTypes.Type, inscope: CompiledTypes.ScopeMap): string {
    let prefix = '';
    const top = p
    let nested = top
    if (top.kind === "DetailedType") {
        switch (top.modification) {
            case Lexicon.Symbol.none:
                break
    
            case Lexicon.Symbol.Array:
                prefix = "Many";
                break
            case Lexicon.Symbol.Optional:
                prefix ="Optional"
                break
            case Lexicon.Symbol.Ref:
                return `InterpreterType::${extractRefStructName(top, inscope)}`
                
            default: Utilities.assertNever(top.modification)
        }
        nested = top.part.CompleteType.differentiate()
    }
    
    let name = '';
    switch (nested.kind) {
        case "DetailedType":
            throw Error(`It is not possible to have a generic within a generic`)
        case "TypeName":
            const trueType = inscope.getEntityOfType(nested.name, "Struct", "Enum")
            if (trueType.kind === "Enum") {
                name = "int64"
                break
            }
            name = nested.name;
            break;
        case "Primitive":
            name = nested.type
    }

    return `InterpreterType::${prefix}${name}`;
}
