import { Resolved, Unresolved, TypeKind } from './entities';
import { assertNever, Classified } from './util/classifying';


function assertNameNotYetInLookup(m: {name: string}, l: Record<string, any>) {
    if (m.name in l) {
        throw Error(`Duplicate entities in scope with name ${m.name}`)
    }
}
type PartialLookup = Record<string, Classified<TypeKind.ENUM, Resolved.Enum> | Classified<TypeKind.MESSAGE, Unresolved.Message>>

function resolveFile(fileEntites: Unresolved.FileEntities, resolved: Record<string, Resolved.FileEntities>): Resolved.FileEntities {
    const intralookup: PartialLookup = {}
    const aliasToFile: Record<string, string> = {}
    fileEntites.imports.forEach(i => {
        assertNameNotYetInLookup({name: i.alias}, aliasToFile)
        aliasToFile[i.alias] = i.location
    })


    fileEntites.msgs.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToFile)
        intralookup[m.name] = {val: m, kind: TypeKind.MESSAGE}
    })
    fileEntites.enms.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToFile)
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
                            const entity = fieldType.val

                            if (entity.from) {
                                const dependentFile = aliasToFile[entity.from]
                                if (!dependentFile) {
                                    throw new Error(`Unable to resolve alias ${entity.from} for type: ${entity.type} in message ${m.val.name}`)            
                                }
                                const targetFile =resolved[dependentFile]

                                let maybeMsg = targetFile.msgs.find(msg => msg.name === entity.type)
                                if (maybeMsg === undefined) {
                                    let maybeEnm = targetFile.enms.find(tenm => tenm.name === entity.type)
                                    if (maybeEnm === undefined) {
                                        throw new Error(`Unable to fine type ${entity.type} in ${entity.from}`)
                                    }
                                    t = {kind: TypeKind.ENUM, val: () => maybeEnm}
                                } else {
                                    t = {kind: TypeKind.MESSAGE, val: () => maybeMsg}
                                }


                            } else {
                                if (!(entity.type in intralookup)) {
                                    throw new Error(`Unable to resolve field type: ${entity.type} in message ${m.val.name}`)            
                                }
                                //@ts-ignore
                                t =  {kind: intralookup[entity.type].kind , val: () => resolvedLookup[entity.type] }
                            }
                            

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

class NeedsCompilation {
    readonly dependencies: Unresolved.Import[]
    readonly dependedOnBy: string[]

    constructor(dependencies: Unresolved.Import[]) {
        this.dependedOnBy = []
        this.dependencies = dependencies
    }     
}

export function resolveDeps(files: Record<string, Unresolved.FileEntities>): Record<string, Resolved.FileEntities> {
    //Put all in need compile state
    const toResolve: Record<string, NeedsCompilation> = {}
    for (const file in files) {
        toResolve[file] = new NeedsCompilation(files[file].imports)
    }

    for (const file in files) {
        toResolve[file].dependencies.map(i => i.location).forEach(upstream => {
            toResolve[upstream].dependedOnBy.push(file)
        }) 
    }

    const resolved: Record<string, Resolved.FileEntities> = {}

    function tryResolve(file: string) {
        const deps = toResolve[file].dependencies
        

        for (let d = 0; d < deps.length; d++) {
            const dep = deps[d];
            if (!(dep.location in resolved)) {
                return
            }
        }
        const r = resolveFile(files[file], resolved)
        resolved[file] = r
        toResolve[file].dependedOnBy.forEach(tryResolve)
    }

    //Try compile all
    const unresolvedKeys = Object.keys(files)
    unresolvedKeys.forEach(tryResolve)

    //All should be compiled
    const resolvedKeys = Object.keys(resolved)
    if (!unresolvedKeys.every(unr => resolvedKeys.includes(unr))) {
        throw new Error(`Not all files could be compiled due to circular dependency\n\n
        All files: ${JSON.stringify(unresolvedKeys, null, 2)}\n\n
        Resolved: ${JSON.stringify(resolvedKeys, null, 2)}
        `)
    }

    return resolved
}