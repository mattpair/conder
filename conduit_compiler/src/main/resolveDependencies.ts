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


        const msgs: Resolved.Message[] = files[file].msgs.map((m: Unresolved.Message) => {
            const resolvedFields: Resolved.Field[] = m.fields.map((f: Unresolved.Field) => {
                let t: Resolved.FieldType
                switch(f.fType.kind) {
                    
                    case TypeKind.PRIMITIVE:
                        t = f.fType
                        break;
                    
                    case TypeKind.DEFERRED:
                        const typeName = f.fType.val.type
                        if (!(typeName in intralookup)) {
                            throw new Error(`Unable to resolve field type: ${f.fType.val.type} in message ${m.name}`)            
                        }
                        const fType: MsgOrEnum = intralookup[typeName]
                        t =  fType as Resolved.FieldType
                        break;
                
                    
                    // default: return assertNever(f.fType.kind)
                    
                }
                return {...f, fType: t}
                
            })
            return {name: m.name, fields: resolvedFields}
        })
        // resolved[file] = {
        //     msgs: files[file].msgs,
        //     enms: files[file].enms,
        //     importTable: lookup
        // }
    }

    return resolved
}