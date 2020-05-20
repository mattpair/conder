import { Resolved, Unresolved } from './entities';
import { assertNever } from './util/classifying';



export function resolve(files: Record<string, Unresolved.FileEntities>): Record<string, Resolved.FileEntities> {
    const resolved: Record<string, Resolved.FileEntities> = {}
    for (const file in files) {
        const lookup: Resolved.EntityLookup = {}

        files[file].msgs.forEach(m => {
            if (m.name in lookup) {
                throw Error(`Duplicate entities in scope with name ${m.name}`)
            }
            lookup[m.name] = {val: m, kind: Resolved.TypeKind.MESSAGE}
        })
        files[file].enms.forEach(m => {
            if (m.name in lookup ) {
                throw Error(`Duplicate entities in scope with name ${m.name}`)
            }
            lookup[m.name] = {val: m, kind: Resolved.TypeKind.ENUM}
        })

        files[file].msgs.forEach(m => m.fields.forEach(f => {
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
        resolved[file] = {
            msgs: files[file].msgs,
            enms: files[file].enms,
            importTable: lookup
        }
    }

    return resolved
}