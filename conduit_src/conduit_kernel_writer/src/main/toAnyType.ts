import { CompiledTypes, Utilities } from 'conduit_parser';
export function toAnyType(p: CompiledTypes.ResolvedType, inscope: CompiledTypes.ScopeMap): string {
    let prefix = '';
    switch (p.modification) {
        case "none":
            break

        case "array":
            prefix = "Many";
            break
        case "optional":
            prefix ="Optional"
            break
        default: Utilities.assertNever(p.modification)
    }
    let name = '';
    switch (p.kind) {
        case "CustomType":
            const trueType = inscope.getEntityOfType(p.type, "Struct", "Enum")
            if (trueType.kind === "Enum") {
                name = "int64"
                break
            }
            name = p.type;
            break;
        case "Primitive":
            name = p.val
    }

    return `AnyType::${prefix}${name}`;
}
