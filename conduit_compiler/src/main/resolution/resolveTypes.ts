import { Parse } from '../parse';
import { FileLocation } from '../util/filesystem';
import { TypeResolved } from '../entity/resolved';
import { assertNever } from '../util/classifying';
import { Enum, EntityKinds } from '../entity/basic';


function assertNameNotYetInLookup(m: {name: string}, l: Set<string>) {
    if (l.has(m.name)) {
        throw Error(`Duplicate entities in scope with name ${m.name}`)
    }
    l.add(m.name)
}

function toFullFilename(i: Parse.Import, thisFileLoc: FileLocation): string {
    return i.fromPresentDir ? `${thisFileLoc.dir}${i.filename}` : i.filename

}

function resolveFile(toResolve: Parse.File, externalResolved: Record<string, TypeResolved.File>): TypeResolved.File {
    const intralookup: Set<string> = new Set()
    const aliasToFile: Map<string, TypeResolved.File> = new Map()
    const nameSet: Set<string> = new Set()
    toResolve.children.Import.forEach(i => {
        assertNameNotYetInLookup(i, nameSet)
        aliasToFile.set(i.name, externalResolved[toFullFilename(i, toResolve.loc)])
    })

    const insertIntoFileScope = (m: Parse.Message | Enum) => {
        assertNameNotYetInLookup(m, nameSet)
        intralookup.add(m.name)
    }
    toResolve.children.Message.forEach(insertIntoFileScope)
    toResolve.children.Enum.forEach(insertIntoFileScope)

    const resolvedLookup: Map<string, Enum | TypeResolved.Message> = new Map()
    const msgs: TypeResolved.Message[] = []

    toResolve.children.Enum.forEach(e => resolvedLookup.set(e.name, e))
    
    toResolve.children.Message.forEach(m => {
        const resolvedFields = m.children.Field.map((f: Parse.Field) => {
            let t: TypeResolved.FieldType
            // Switches on the variable so assertnever works.
            const fieldType = f.part.FieldType.differentiate()
            switch(fieldType.kind) {
                
                case "Primitive":
                    t = {differentiate: () => fieldType , kind: "FieldType"}
                    break;

                case "FromEntitySelect":
                    const targetFile = aliasToFile.get(fieldType.from)

                    if (targetFile === undefined) {
                        throw new Error(`Unable to resolve alias ${fieldType.from} for type: ${fieldType.part.CustomType.type} in message ${m.name}`)            
                    }                            

                    if (targetFile.entityLookup.has(fieldType.part.CustomType.type)) {
                        const ent = targetFile.entityLookup.get(fieldType.part.CustomType.type)
                        // TODO: loc should be reference location, not entity location.
                        t = {differentiate: () => ent,  kind: "FieldType"}            
                        
                    } else {
                        throw new Error(`Unable to find type ${fieldType.part.CustomType.type} in ${fieldType.from}`)
                    }

                    break;
                                            
                case "CustomType":
                    
                    if (!intralookup.has(fieldType.type)) {
                        throw new Error(`Unable to resolve field type: ${fieldType.type} in message ${m.name}`)            
                    }
                    t =  {
                        differentiate: () => resolvedLookup.get(fieldType.type),
                        kind: "FieldType"
                    }
                    
                    break;
            
                default: return assertNever(fieldType)
                
            }
            return {...f, part: {FieldType: t}}
        })
        const rmsg: TypeResolved.Message = {
            kind: "Message", 
            name: m.name, 
            loc: m.loc,
            children: {Field: resolvedFields}}
        resolvedLookup.set(m.name, rmsg)
        msgs.push(rmsg)
    })
        
                
                
    return {
        kind: "File",
        loc: toResolve.loc,
        entityLookup: resolvedLookup,
        importAliasToFile: aliasToFile,
        children: {
            Import: toResolve.children.Import.map(v => ({
                kind: "Import", 
                name: v.name, 
                dep: toFullFilename(v, toResolve.loc), 
                loc: v.loc
            })),
            Function: toResolve.children.Function
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


export function resolveDeps(unresolved: Parse.File[]): TypeResolved.File[] {
    const toResolve: UnresolvedFileLookup = buildNeedsCompileSet(unresolved)
    const resolved: Record<string, TypeResolved.File> = {}

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
    const ret: TypeResolved.File[] = []
    for (const file in resolved) {
        ret.push(resolved[file])
    }
    return ret
}