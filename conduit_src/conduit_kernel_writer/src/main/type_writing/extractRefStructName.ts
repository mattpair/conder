import { Parse, Lexicon } from 'conduit_parser';
import { CompiledTypes } from 'conduit_parser';


export function extractRefStructName(type: Parse.DetailedType, inScope: CompiledTypes.ScopeMap): string {
    if (type.modification !== Lexicon.Symbol.Ref) {
        throw Error(`Expected a ref type`)
    }
    
    const r = type.part.CompleteType.differentiate()
    
    if (r.kind !== "TypeName") {
        throw Error(`Expected a type name to reference`)
    }
    const inner = inScope.getEntityOfType(r.name, "HierarchicalStore")
    return `${r.name}Ref`
}