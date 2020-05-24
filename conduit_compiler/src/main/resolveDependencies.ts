import { FileLocation } from './util/filesystem';
import { Resolved, Unresolved, TypeKind } from './entities';
import { assertNever, Classified } from './util/classifying';


function assertNameNotYetInLookup(m: {name: string}, l: Record<string, any>) {
    if (m.name in l) {
        throw Error(`Duplicate entities in scope with name ${m.name}`)
    }
}
type PartialLookup = Record<string, Classified<TypeKind.ENUM, Resolved.Enum> | Classified<TypeKind.MESSAGE, Unresolved.Message>>

function resolveFile(toResolve: Unresolved.ConduitFile, externalResolved: Record<string, Resolved.FileEntities>): Resolved.FileEntities {
    const intralookup: PartialLookup = {}
    const aliasToAbsFilename: Record<string, string> = {}
    toResolve.ents.imports.forEach(i => {
        assertNameNotYetInLookup({name: i.alias}, aliasToAbsFilename)
        aliasToAbsFilename[i.alias] = i.fromPresentDir ? `${toResolve.loc.dir}${i.location}` : i.location
    })


    toResolve.ents.msgs.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToAbsFilename)
        intralookup[m.name] = {val: m, kind: TypeKind.MESSAGE}
    })
    toResolve.ents.enms.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToAbsFilename)
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
                                const dependentFile = aliasToAbsFilename[entity.from]
                                if (!dependentFile) {
                                    throw new Error(`Unable to resolve alias ${entity.from} for type: ${entity.type} in message ${m.val.name}`)            
                                }
                                
                                const targetFile = externalResolved[dependentFile]

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
                                t =  {kind: intralookup[entity.type].kind , val: () => resolvedLookup[entity.type].val }
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
        enms: toResolve.ents.enms,
        deps: Object.values(aliasToAbsFilename)
    }
}

class FileNeedingCompilation<DATA> {
    readonly absoluteDependencies: string[]
    readonly dependedOnBy: string[]
    readonly location: FileLocation
    readonly data: DATA

    constructor(dependencies: Unresolved.Import[], location: FileLocation, data: DATA) {
        this.dependedOnBy = []
        this.absoluteDependencies = dependencies.map(imp => imp.fromPresentDir ? `${location.dir}${imp.location}` : imp.location)
        this.location = location
        this.data = data
    }     
}

type UnresolvedFileLookup = Readonly<Record<string, FileNeedingCompilation<Unresolved.ConduitFile>>>

function buildNeedsCompileSet(files: Unresolved.ConduitFile[]): UnresolvedFileLookup {
    //Put all in need compile state
    const toResolve: Record<string, FileNeedingCompilation<Unresolved.ConduitFile>> = {}
    files.forEach(file => {
        toResolve[file.loc.fullname] = new FileNeedingCompilation(file.ents.imports, file.loc, file)
    })


    files.forEach(file => {
        toResolve[file.loc.fullname].absoluteDependencies.forEach(absDep => {
            if (!(absDep in toResolve)) {
                throw new Error(`Cannot find imported file ${absDep} from file ${file.loc.fullname}`)
            }
            toResolve[absDep].dependedOnBy.push(file.loc.fullname)
        }) 
    })
    return toResolve
}

export function resolveDeps(unresolved: Unresolved.ConduitFile[]): Resolved.ConduitFile[] {
    const toResolve: UnresolvedFileLookup = buildNeedsCompileSet(unresolved)
    const resolved: Record<string, Resolved.FileEntities> = {}

    function tryResolve(absFilename: string) {
        const deps = toResolve[absFilename].absoluteDependencies
        
        for (let d = 0; d < deps.length; d++) {
            const dep = deps[d];
            if (!(dep in resolved)) {
                return
            }
        }
        const r = resolveFile(toResolve[absFilename].data, resolved)
        resolved[absFilename] = r
        toResolve[absFilename].dependedOnBy.forEach(tryResolve)
    }

    //Try compile all
    unresolved.forEach(file => tryResolve(file.loc.fullname))

    //All should be compiled
    if (!unresolved.every(unr => unr.loc.fullname in resolved)) {
        throw new Error(`Not all files could be compiled due to circular dependency\n\n
        All files: ${JSON.stringify(unresolved.map(u => u.loc.fullname), null, 2)}\n\n
        Resolved: ${JSON.stringify(Object.keys(resolved), null, 2)}
        `)
    }
    const ret: Resolved.ConduitFile[] = []
    for (const file in resolved) {
        ret.push({
            loc: new FileLocation(file),
            ents: resolved[file]
        })
    }
    return ret
}