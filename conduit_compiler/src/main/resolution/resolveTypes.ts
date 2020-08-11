
import { Parse } from '../parse';
import { FileLocation } from '../utils';
import { Struct, Field, ResolvedType, EntityMap} from '../entity/resolved';
import { TypeResolved } from "../entity/TypeResolved";
import { assertNever } from '../utils';
import  * as basic from '../entity/basic';
import { Primitives } from '../lexicon';

type FirstPassEntity = (Parse.Struct | basic.Enum | Parse.Function | Parse.StoreDefinition) & {file: FileLocation}
export function toNamespace(unresolved: Parse.File[]): TypeResolved.Namespace {
    const firstPassScope: Map<string, FirstPassEntity> = new Map()
    const childType: (keyof Parse.File["children"])[] = ["Struct", "Enum", "Function", "StoreDefinition"]
    unresolved.forEach(file => {
        childType.forEach((type) => {
            file.children[type].forEach((ent: Parse.Struct | basic.Enum | Parse.Function | Parse.StoreDefinition) => {
                const existing = firstPassScope.get(ent.name)
                if (existing !== undefined) {
                    throw new Error(`Entity name: ${ent.name} is used multiple times in default namespace
                    once here: ${existing.file.fullname} ${existing.loc.startLineNumber}
                    and again here: ${file.loc.fullname} ${ent.loc.startLineNumber}
                    `)
                }
                firstPassScope.set(ent.name, {...ent, file: file.loc})
            })
        })
    })
    

    const secondPassScope: Map<string, TypeResolved.TopLevelEntities> = new Map()

    function tryResolveFieldType(name: string, modification: basic.TypeModification): ResolvedType | undefined  {
        const alreadyResolved = secondPassScope.get(name)
            
        if (alreadyResolved !== undefined) {
            switch(alreadyResolved.kind) {
                case "StoreDefinition":
                case "Function":
                    throw new Error(`Field may not reference ${alreadyResolved.kind} ${name}`)
                case "Enum":
                    if (modification === "optional") {
                        throw new Error(`Enum fields may not be optional`)
                    }
                case "Struct":
                
                    return {kind: "custom", name: alreadyResolved.name}

                default: assertNever(alreadyResolved)
            }
        }
    }

    function resolveMessage(ent: Parse.Struct & {file: FileLocation}): void  {
        const fields: Field[] = []
        ent.children.Field.forEach(field => {
            const type = field.part.FieldType.differentiate()
            let newType: ResolvedType = undefined
        
            switch(type.kind) {
                case "CustomType":
                    const prim = Primitives.find(p => p === type.type)
                    if (prim) {
                        newType = {
                            kind: "Primitive",
                            loc: type.loc,
                            val: prim,
                            modification: type.modification
                        }
                        break
                    }

                
                    if (type.type === ent.name) {
                        //TODO: eventually allow types to contain instances of self.
                        throw new Error(`Currently do not support self-referencing types: ${ent.name}`)
                    }
                    const alreadyResolved = tryResolveFieldType(type.type, type.modification)
                    if (alreadyResolved !== undefined) {
                        newType = alreadyResolved
                        break
                    }

                    const notYetResolved = firstPassScope.get(type.type)
                    if (notYetResolved === undefined) {
                        throw new Error(`Unable to resolve type of field ${type.type} from struct: ${ent.name}`)
                    }  
                    resolveEntity(notYetResolved)
                    
                    newType = tryResolveFieldType(notYetResolved.name, type.modification)
                    break
            

                default: assertNever(type.kind)
            }
            

            fields.push({ 
                loc: field.loc,
                kind: "Field",
                name: field.name,
                part: {
                    FieldType: {
                        kind: "FieldType",
                        differentiate: () => newType,
                        modification: field.part.FieldType.differentiate().modification
                    }
                }
            })
        })
        const out: Struct = {
            kind: "Struct",
            loc: ent.loc,
            children: {
                Field: fields
            },
            name: ent.name,
            file: ent.file            
        }
        secondPassScope.set(ent.name, out)   
        return
    }

    
    function resolveEntity(firstPassEnt: FirstPassEntity): void {
        if (secondPassScope.has(firstPassEnt.name)) {
            return
        }
        
        switch(firstPassEnt.kind) {
            case "Struct":
                return resolveMessage(firstPassEnt)

            case "StoreDefinition":
                const t = firstPassScope.get(firstPassEnt.part.CustomType.type)
                if (t === undefined) {
                    throw Error(`Cannot find referenced struct for store ${firstPassEnt.part.CustomType.type}`)
                }

                if (firstPassEnt.part.CustomType.modification !== "array") {
                    throw Error(`Global instances must be arrays for now`)
                }
                switch(t.kind) {
                    case "Struct":
                        resolveMessage(t)
                        secondPassScope.set(firstPassEnt.name, {
                            kind: "StoreDefinition",
                            loc: firstPassEnt.loc,
                            name: firstPassEnt.name,
                            stores: firstPassEnt.part.CustomType.type
                        })
                        return
                    default: 
                        throw Error(`Stores may not reference ${t.kind}`)
                }
                
    
            case "Enum":
            case "Function":
                secondPassScope.set(firstPassEnt.name, firstPassEnt)
                return
            default: assertNever(firstPassEnt)
        }
    }
        
    
    firstPassScope.forEach((val) => {
        resolveEntity(val)
    })

    return {name: "default", inScope: new EntityMap(secondPassScope)}

}