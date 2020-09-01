import { CompiledTypes } from 'conduit_parser';
import { assertNever } from 'conduit_parser/dist/src/main/utils';
import { primitiveToRustType } from './primitiveToRustType';

export function resolvedToRustType(r: CompiledTypes.ResolvedType, inScope: CompiledTypes.ScopeMap): string {
    let base = '';
    switch (r.kind) {
        case "Primitive":
            base = primitiveToRustType(r.val);
            break;

        case "CustomType":
            const ent = inScope.getEntityOfType(r.type, "Enum", "Struct");
            switch (ent.kind) {
                case "Struct":
                    base = r.type;
                    break;

                case "Enum":
                    base = 'i64';
                    break;
            }
            break;

        default: assertNever(r);
    }
    let prefix = '';
    let suffix = '';
    switch (r.modification) {
        case "array":
            prefix = 'Vec<';
            suffix = '>';
        case "none":
            break;

        case "optional":
            prefix = 'Option<';
            suffix = '>';
            break;

        default: assertNever(r.modification);
    }
    return `${prefix}${base}${suffix}`;
}
