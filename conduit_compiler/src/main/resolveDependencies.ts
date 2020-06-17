import { Parse } from './parseStep1';
import { FileLocation } from './util/filesystem';
import { Resolved } from './entity/resolved';
import { assertNever } from './util/classifying';
import { Enum, EntityKinds } from './entity/basic';


function assertNameNotYetInLookup(m: {name: string}, l: Record<string, any>) {
    if (m.name in l) {
        throw Error(`Duplicate entities in scope with name ${m.name}`)
    }
}
type PartialLookup = Record<string, Enum | Parse.Message>

function toFullFilename(i: Parse.Import, thisFileLoc: FileLocation): string {
    return i.fromPresentDir ? `${thisFileLoc.dir}${i.filename}` : i.filename

}

function resolveFile(toResolve: Parse.File, externalResolved: Record<string, Resolved.ConduitFile>): Resolved.ConduitFile {
    const intralookup: PartialLookup = {}
    const aliasToAbsFilename: Record<string, string> = {}
    toResolve.children.Import.forEach(i => {
        assertNameNotYetInLookup({name: i.name}, aliasToAbsFilename)
        aliasToAbsFilename[i.name] = toFullFilename(i, toResolve.loc)
    })


    toResolve.children.Message.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToAbsFilename)
        intralookup[m.name] = m
    })
    toResolve.children.Enum.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToAbsFilename)
        intralookup[m.name] = m
    })
    const resolvedLookup: Record<string, Enum | Resolved.Message> = {}
    const msgs: Resolved.Message[] = []

    
    Object.values(intralookup).forEach(m => {
        switch(m.kind) {
            case "Enum":
                resolvedLookup[m.name] = m
                break;

            case "Message":
                
                const resolvedFields = m.children.Field.map((f: Parse.Field) => {
                    let t: Resolved.FieldType
                    // Switches on the variable so assert never works.
                    const fieldType = f.peer.differentiate()
                    switch(fieldType.kind) {
                        
                        case "Primitive":
                            t = {differentiate: () => fieldType , kind: "FieldType"}
                            break;
                        
                        case "CustomType":
                            if (fieldType.from) {
                                const dependentFile = aliasToAbsFilename[fieldType.from]
                                if (!dependentFile) {
                                    throw new Error(`Unable to resolve alias ${fieldType.from} for type: ${fieldType.type} in message ${m.name}`)            
                                }
                                
                                const targetFile = externalResolved[dependentFile]

                                let maybeMsg = targetFile.children.Message.find(msg => msg.name === fieldType.type)
                                if (maybeMsg === undefined) {
                                    let maybeEnm = targetFile.children.Enum.find(tenm => tenm.name === fieldType.type)
                                    if (maybeEnm === undefined) {
                                        throw new Error(`Unable to find type ${fieldType.type} in ${fieldType.from}`)
                                    }
                                    // TODO: loc should be reference location, not entity location.
                                    t = {differentiate: () => maybeEnm,  kind: "FieldType"}
                                } else {
                                    t = {differentiate: () => maybeMsg, kind: "FieldType"}
                                }


                            } else {
                                if (!(fieldType.type in intralookup)) {
                                    throw new Error(`Unable to resolve field type: ${fieldType.type} in message ${m.name}`)            
                                }
                                t =  {
                                    differentiate: () => resolvedLookup[fieldType.type],
                                    kind: "FieldType"
                                }
                            }
                            

                            break;
                    
                        default: return assertNever(fieldType)
                        
                    }
                    return {...f, peer: t}
                })
                const rmsg: Resolved.Message = {
                    kind: "Message", 
                    name: m.name, 
                    loc: m.loc,
                    children: {Field: resolvedFields}}
                resolvedLookup[m.name] = rmsg
                msgs.push(rmsg)
                
                break;

            default: return assertNever(m)

        }

        
    })
    return {
        kind: "File",
        loc: toResolve.loc,
        children: {
            Message: msgs,
            Enum: toResolve.children.Enum,
            Import: toResolve.children.Import.map(v => ({
                kind: "Import", 
                name: v.name, 
                dep: toFullFilename(v, toResolve.loc), 
                loc: v.loc
            }))
        }
    }
}

class FileNeedingCompilation<DATA> {
    readonly absoluteDependencies: string[]
    readonly dependedOnBy: string[]
    readonly location: FileLocation
    readonly data: DATA

    constructor(dependencies: Parse.Import[], location: FileLocation, data: DATA) {
        this.dependedOnBy = []
        this.absoluteDependencies = dependencies.map(imp => imp.fromPresentDir ? `${location.dir}${imp.filename}` : imp.filename)
        this.location = location
        this.data = data
    }     
}

type UnresolvedFileLookup = Readonly<Record<string, FileNeedingCompilation<Parse.File>>>

function buildNeedsCompileSet(files: Parse.File[]): UnresolvedFileLookup {
    //Put all in need compile state
    const toResolve: Record<string, FileNeedingCompilation<Parse.File>> = {}
    files.forEach(file => {
        toResolve[file.loc.fullname] = new FileNeedingCompilation(file.children.Import, file.loc, file)
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


export function resolveDeps(unresolved: Parse.File[]): Resolved.ConduitFile[] {
    const toResolve: UnresolvedFileLookup = buildNeedsCompileSet(unresolved)
    const resolved: Record<string, Resolved.ConduitFile> = {}

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
        ret.push(resolved[file])
    }
    return ret
}