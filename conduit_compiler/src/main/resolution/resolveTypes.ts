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
    const inFileScope: Map<string, TypeResolved.File | TypeResolved.Message | Enum> = new Map()
    const nameSet: Set<string> = new Set()
    toResolve.children.Import.forEach(i => {
        assertNameNotYetInLookup(i, nameSet)
        inFileScope.set(i.name, externalResolved[toFullFilename(i, toResolve.loc)])
    })

    const reserveName = (m: Parse.Message | Enum) => {
        assertNameNotYetInLookup(m, nameSet)
        intralookup.add(m.name)
    }
    toResolve.children.Enum.forEach(enm => {
        reserveName(enm)
        inFileScope.set(enm.name, enm)
    })

    toResolve.children.Message.forEach(reserveName)
    
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
                    const targetEntity = inFileScope.get(fieldType.from)

                    if (targetEntity === undefined) {
                        throw new Error(`Unable to resolve alias ${fieldType.from} for type: ${fieldType.part.CustomType.type} in message ${m.name}`)            
                    }                            
                    switch(targetEntity.kind) {
                        case "File":
                            const importedEntity = targetEntity.inFileScope.get(fieldType.part.CustomType.type)
                            if (importedEntity !== undefined && importedEntity.kind !== "File") {
                                
                                // TODO: loc should be reference location, not entity location.
                                t = {differentiate: () => importedEntity,  kind: "FieldType"}            
                                
                            } else {
                                throw new Error(`Unable to find type ${fieldType.part.CustomType.type} in ${fieldType.from}`)
                            }
                    }

                    

                    break;
                                            
                case "CustomType":
                    
                    if (!intralookup.has(fieldType.type)) {
                        throw new Error(`Unable to resolve field type: ${fieldType.type} in message ${m.name}`)            
                    }
                    t =  {
                        differentiate: () => inFileScope.get(fieldType.type) as TypeResolved.Message | Enum,
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
        inFileScope.set(m.name, rmsg)
    })
        
                
                
    return {
        kind: "File",
        loc: toResolve.loc,
        inFileScope,
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