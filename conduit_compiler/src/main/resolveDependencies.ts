import { Resolved, Unresolved } from './entities';
import { assertNever } from './util/classifying';

    type EntityLookup = Record<string, Resolved.MessageOrEnum>


    export function resolve(mess: Unresolved.Message[], enums: Resolved.Enum[]): EntityLookup {
        const lookup: EntityLookup = {}
        mess.forEach(m => {
            if (m.name in lookup) {
                throw Error(`Duplicate entities in scope with name ${m.name}`)
            }
            lookup[m.name] = {val: m, kind: Resolved.TypeKind.MESSAGE}
        })
        enums.forEach(m => {
            if (m.name in lookup ) {
                throw Error(`Duplicate entities in scope with name ${m.name}`)
            }
            lookup[m.name] = {val: m, kind: Resolved.TypeKind.ENUM}
        })

        mess.forEach(m => m.fields.forEach(f => {
            const t = f.fType
            switch(t.kind) {
                case Unresolved.FieldKind.PRIMITIVE:
                    break;
                case Unresolved.FieldKind.CUSTOM:
                    if (!(t.val.type in lookup)) {
                        throw Error(`Unable to resolve field type: ${t.val.type} in message ${m.name}`)
                    }
                    break;

                default: assertNever(t)
            }
        }))

        return lookup
    }