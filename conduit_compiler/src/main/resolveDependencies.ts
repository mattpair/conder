import { Resolved, Unresolved, TypeKind } from './entities';
import { assertNever, Classified } from './util/classifying';


function assertNameNotYetInLookup(m: {name: string}, l: PartialLookup) {
    if (m.name in l) {
        throw Error(`Duplicate entities in scope with name ${m.name}`)
    }
}
type PartialLookup = Record<string, Classified<TypeKind.ENUM, Resolved.Enum> | Classified<TypeKind.MESSAGE, Unresolved.Message>>

function resolveFile(fileEntites: Unresolved.FileEntities): Resolved.FileEntities {
    const intralookup: PartialLookup = {}

    fileEntites.msgs.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        intralookup[m.name] = {val: m, kind: TypeKind.MESSAGE}
    })
    fileEntites.enms.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        intralookup[m.name] = {val: m, kind: TypeKind.ENUM}
    })
    const resolvedLookup: Record<string, Classified<TypeKind.ENUM, Resolved.Enum> | Classified<TypeKind.MESSAGE, Resolved.Message>> = {}
    const msgs: Resolved.Message[] = []

    
    Object.values(intralookup).forEach((m: Classified<TypeKind.ENUM, Resolved.Enum> | Classified<TypeKind.MESSAGE, Unresolved.Message>) => {
        switch(m.kind) {
            case TypeKind.ENUM:
                resolvedLookup[m.val.name] = m
                break;

            case TypeKind.MESSAGE:
                
                const resolvedFields = m.val.fields.map((f: Unresolved.Field) => {
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
                            //@ts-ignore
                            t =  {kind: intralookup[fieldType.val.type].kind , val: () => resolvedLookup[fieldType.val.type] }

                            break;
                    
                        default: return assertNever(fieldType)
                        
                    }
                    return {...f, fType: t}
                    
                })
                const rmsg = {name: m.val.name, fields: resolvedFields}
                resolvedLookup[m.val.name] = {kind: TypeKind.MESSAGE, val: rmsg}
                msgs.push(rmsg)
                
                break;

            default: return assertNever(m)

        }

        
    })
    return {
        msgs,
        enms: fileEntites.enms,
    }
}

export function resolve(files: Record<string, Unresolved.FileEntities>): Record<string, Resolved.FileEntities> {
    const resolved: Record<string, Resolved.FileEntities> = {}
    // Assume no imports for now.
    for (const file in files) {
        resolved[file] = resolveFile(files[file])
    }

    return resolved
}