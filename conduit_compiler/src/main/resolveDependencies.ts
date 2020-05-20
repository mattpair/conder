import { PrimitiveUnion } from './lexicon';
import { Resolved, Unresolved, BaseField, PartialResolved, TypeKind } from './entities';
import { assertNever, Classified } from './util/classifying';


function assertNameNotYetInLookup(m: {name: string}, l: PartialLookup) {
    if (m.name in l) {
        throw Error(`Duplicate entities in scope with name ${m.name}`)
    }
}
type MsgOrEnum = Classified<TypeKind.ENUM, Resolved.Enum> | Classified<TypeKind.MESSAGE, PartialResolved.Message>
type PartialLookup = Record<string, MsgOrEnum>

export function resolve(files: Record<string, Unresolved.FileEntities>): Record<string, Resolved.FileEntities> {
    const resolved: Record<string, Resolved.FileEntities> = {}
    // Assume no imports for now.
    for (const file in files) {
        const intralookup: PartialLookup = {}

        files[file].msgs.forEach(m => {
            assertNameNotYetInLookup(m, intralookup)
            intralookup[m.name] = {val: m, kind: TypeKind.MESSAGE}
        })
        files[file].enms.forEach(m => {
            assertNameNotYetInLookup(m, intralookup)
            intralookup[m.name] = {val: m, kind: TypeKind.ENUM}
        })

        const msgs: Resolved.Message[] = []
        
         Object.values(intralookup).forEach((m: MsgOrEnum) => {
            switch(m.kind) {
                case TypeKind.ENUM:
                    break;

                case TypeKind.MESSAGE:
                    
                    m.val.fields.forEach((f: Unresolved.Field) => {
                        let t: Resolved.FieldType
                        // Switches on the variable so assert never works.
                        const fieldType: Unresolved.FieldType = f.fType
                        switch(fieldType.kind) {
                            
                            case TypeKind.PRIMITIVE:
                                t = fieldType
                                break;
                            
                            case TypeKind.DEFERRED:
                                const typeName = fieldType.val.type
                                if (!(typeName in intralookup)) {
                                    throw new Error(`Unable to resolve field type: ${fieldType.val.type} in message ${m.val.name}`)            
                                }
                                t =  intralookup[typeName] as Resolved.FieldType
                                break;
                        
                            default: return assertNever(fieldType)
                            
                        }
                        return {...f, fType: t}
                        
                    })
                    msgs.push(intralookup[m.val.name].val as Resolved.Message)
                    break;

                default: return assertNever(m)

            }

            
        })
        resolved[file] = {
            msgs,
            enms: files[file].enms,
        }
    }

    return resolved
}