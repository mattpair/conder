import { FileWithLocation, Parse, Enum, EntityKind } from './parseStep1';
import { FileLocation } from './util/filesystem';
import { Resolved } from './entities';
import { assertNever } from './util/classifying';


function assertNameNotYetInLookup(m: {name: string}, l: Record<string, any>) {
    if (m.name in l) {
        throw Error(`Duplicate entities in scope with name ${m.name}`)
    }
}
type PartialLookup = Record<string, Enum | Parse.Message>

function resolveFile(toResolve: FileWithLocation, externalResolved: Record<string, Resolved.FileEntities>): Resolved.FileEntities {
    const intralookup: PartialLookup = {}
    const aliasToAbsFilename: Record<string, string> = {}
    toResolve.content.children.Import.forEach(i => {
        assertNameNotYetInLookup({name: i.name}, aliasToAbsFilename)
        aliasToAbsFilename[i.name] = i.fromPresentDir ? `${toResolve.loc.dir}${i.filename}` : i.filename
    })


    toResolve.content.children.Message.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToAbsFilename)
        intralookup[m.name] = m
    })
    toResolve.content.children.Enum.forEach(m => {
        assertNameNotYetInLookup(m, intralookup)
        assertNameNotYetInLookup(m, aliasToAbsFilename)
        intralookup[m.name] = m
    })
    const resolvedLookup: Record<string, Enum | Resolved.Message> = {}
    const msgs: Resolved.Message[] = []

    
    Object.values(intralookup).forEach(m => {
        switch(m.kind) {
            case EntityKind.Enum:
                resolvedLookup[m.name] = m
                break;

            case EntityKind.Message:
                
                const resolvedFields = m.children.Field.map((f: Parse.Field) => {
                    let t: Resolved.FieldType
                    // Switches on the variable so assert never works.
                    const fieldType: Parse.FieldType = f.fType
                    switch(fieldType.kind) {
                        
                        case "primitive":
                            t = fieldType
                            break;
                        
                        case "deferred":
                            const entity = fieldType.val
                            if (entity.from) {
                                const dependentFile = aliasToAbsFilename[entity.from]
                                if (!dependentFile) {
                                    throw new Error(`Unable to resolve alias ${entity.from} for type: ${entity.type} in message ${m.name}`)            
                                }
                                
                                const targetFile = externalResolved[dependentFile]

                                let maybeMsg = targetFile.msgs.find(msg => msg.name === entity.type)
                                if (maybeMsg === undefined) {
                                    let maybeEnm = targetFile.enms.find(tenm => tenm.name === entity.type)
                                    if (maybeEnm === undefined) {
                                        throw new Error(`Unable to fine type ${entity.type} in ${entity.from}`)
                                    }
                                    t = {kind: EntityKind.Enum, val: () => maybeEnm}
                                } else {
                                    t = {kind: EntityKind.Message, val: () => maybeMsg}
                                }


                            } else {
                                if (!(entity.type in intralookup)) {
                                    throw new Error(`Unable to resolve field type: ${entity.type} in message ${m.name}`)            
                                }
                                //@ts-ignore                                
                                t =  {kind: intralookup[entity.type].kind , val: () => resolvedLookup[entity.type] }
                            }
                            

                            break;
                    
                        default: return assertNever(fieldType)
                        
                    }
                    return {...f, fType: t}
                })
                const rmsg: Resolved.Message = {
                    kind: EntityKind.Message, 
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
        msgs,
        enms: toResolve.content.children.Enum,
        deps: Object.values(aliasToAbsFilename)
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

type UnresolvedFileLookup = Readonly<Record<string, FileNeedingCompilation<FileWithLocation>>>

function buildNeedsCompileSet(files: FileWithLocation[]): UnresolvedFileLookup {
    //Put all in need compile state
    const toResolve: Record<string, FileNeedingCompilation<FileWithLocation>> = {}
    files.forEach(file => {
        toResolve[file.loc.fullname] = new FileNeedingCompilation(file.content.children.Import, file.loc, file)
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

export type Return =  {loc: FileLocation, ents: Resolved.FileEntities}

export function resolveDeps(unresolved: FileWithLocation[]): Return[] {
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
    const ret: Return[] = []
    for (const file in resolved) {
        ret.push({
            loc: new FileLocation(file),
            ents: resolved[file]
        })
    }
    return ret
}