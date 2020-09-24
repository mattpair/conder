import { AnySchemaInstance, schemaFactory, SchemaInstance } from './../SchemaFactory';
import { TypeModifierUnion } from '../lexicon';

import { Parse } from '../parse';
import { FileLocation } from '../utils';
import { Struct, EntityMap, HierarchicalStore, Function, SchemaFactory } from '../entity/resolved';
import { assertNever } from '../utils';
import  * as basic from '../entity/basic';
import { Symbol } from '../lexicon';
export type PartialEntityMap<T=undefined> = Map<string, Struct | basic.Enum | Function | HierarchicalStore | T>


type FirstPassEntity = (Parse.Struct | basic.Enum | Parse.StoreDefinition ) & {file: FileLocation}
type ParentTypeInfo = Readonly<{kind: "type", name: string} | {kind: "modification", mod: TypeModifierUnion}>
type SchemaLookup = Map<string, SchemaInstance<"Object">>

export function toEntityMap(unresolved: Parse.File[]): [PartialEntityMap, SchemaFactory] {
    const firstPassScope: Map<string, FirstPassEntity> = new Map()
    const childType = ["Struct", "Enum", "StoreDefinition"]
    unresolved.forEach(file => {
        childType.forEach((type) => {
            //@ts-ignore
            file.children[type].forEach((ent: Parse.Struct | basic.Enum | Parse.StoreDefinition) => {
                const existing = firstPassScope.get(ent.name)
                if (existing !== undefined) {
                    throw new Error(`Entity name: ${ent.name} is defined multiple times in default namespace
                    once here: ${existing.file.fullname} ${existing.loc.startLineNumber}
                    and again here: ${file.loc.fullname} ${ent.loc.startLineNumber}
                    `)
                }
                firstPassScope.set(ent.name, {...ent, file: file.loc})
            })
        })
    })


    const schemaLookup: SchemaLookup = new Map()

    function getSchema(type: Parse.CompleteType, info: ParentTypeInfo[]): AnySchemaInstance {
        const t = type.differentiate()
        const last: ParentTypeInfo | undefined = info.length >= 1 ? info[info.length - 1] : undefined
        switch (t.kind) {
            case "TypeName":
                
                if (info.some(p => p.kind === "type" && p.name === t.name)) {
                    throw Error(`Type invalid because ${t.name} is recursive`)
                }

                const ref = firstPassScope.get(t.name)
                if (ref === undefined) {
                    throw Error(`${t.name} does not refer to any known type`)
                }

                if (last !== undefined && last.kind === "modification" && last.mod === Symbol.Ref) {
                    if (ref.kind === "StoreDefinition") {
                        return schemaFactory.Ref(ref.name)
                    } else {
                        throw Error("Refs must refer to an array at the global level.")
                    }                   
                } 
                
                
            
                let newSchema: AnySchemaInstance = undefined
                 
                if (!schemaLookup.has(t.name)) {
                    switch (ref.kind) {
                        case "Enum":
                            if (last !== undefined && last.kind === "modification") {
                                switch (last.mod) {
                                    case Symbol.Optional: 
                                        throw Error(`Optional enum is unsupported.`)
                                    case Symbol.Ref:
                                        throw Error(`References can only be held for globals`)
                                }
                            }
                            return schemaFactory.int
                            
                        case "Struct":
                            const schemaMap: SchemaInstance<"Object"> = {kind: "Object", data: {}}
                            info.push({kind: "type", name: ref.name})
                            ref.children.Field.forEach(f => {
                                const s = getSchema(f.part.CompleteType, info)
                                schemaMap.data[f.name] = s
                            })
                            newSchema = schemaMap
                            info.pop()
                            break
                        case "StoreDefinition":
                            throw Error("Globals may only be referenced in types to define refs.")
                        default: assertNever(ref)
                    }
                    
                    schemaLookup.set(t.name, newSchema)
                }
                return schemaLookup.get(t.name)
                
            case "Primitive":
                if (last !== undefined && last.kind === "modification") {
                    if (last.mod === Symbol.Ref) {
                        throw Error(`References may only be made to structs stored at the global level.`)
                    }
                }
                
                return schemaFactory[t.type]
            case "DetailedType":
                let schemaWrapper = undefined
                switch (t.modification) {
                    case Symbol.Optional:
                        if (last !== undefined && last.kind === "modification") {
                            switch (last.mod) {
                                case Symbol.Array:
                                    throw Error(`Don't create Arrays of optionals. Just don't add the undesired elements to the array.`)
                                case Symbol.Optional:
                                    throw Error(`Nesting optionals defeats the purpose of optionals`)
                                case Symbol.Ref:
                                    throw Error(`Holding a reference to an optional is not allowed`)
                                case Symbol.none:
                                    break
                                default: assertNever(last.mod)
                            }
                        }
                        schemaWrapper = schemaFactory.Optional
                        break

                    case Symbol.Array:
                        
                        if (last !== undefined && last.kind === "modification") {
                            switch (last.mod) {
                                case Symbol.Array:
                                    throw Error(`Arrays in arrays aren't supported`)
                                case Symbol.Optional:
                                    throw Error(`Instead of having an optional array, just store an empty array.`)
                                case Symbol.Ref:
                                    throw Error(`Holding a reference to an array is not allowed`)
                                case Symbol.none:
                                    break
                                default: assertNever(last.mod)
                            }
                        }
                        schemaWrapper = schemaFactory.Array
                        break
                    case Symbol.Ref:
                        schemaWrapper = (a: AnySchemaInstance) => a
                        break

                    case Symbol.none:
                        return getSchema(t.part.CompleteType, info)
                    
                    default: assertNever(t.modification)
                }


                info.push({kind: "modification", mod: t.modification})
                const ret = schemaWrapper(getSchema(t.part.CompleteType, info))
                info.pop()
                return ret

            default: assertNever(t)
        }
    }

    function validateGlobal(store: Parse.StoreDefinition): Parse.TypeName {
        const firstTypePart = store.part.CompleteType.differentiate()
        if (firstTypePart.kind !== "DetailedType" || firstTypePart.modification !== Symbol.Array) {
            throw Error(`Only arrays may be global`)
        }
        const secondTypePart = firstTypePart.part.CompleteType.differentiate()
        if (secondTypePart.kind !== "TypeName") {
            throw Error(`Global arrays must contain structs`)
        }
        return secondTypePart
    }
    

    firstPassScope.forEach(en => {
        switch(en.kind) {
            case "Enum":
            case "Struct":
                getSchema({kind: "CompleteType", differentiate: () => ({kind: "TypeName", name: en.name})}, [])
                break
            
        }
    })

    const partialEntityMap: PartialEntityMap = new Map()

    unresolved.forEach(file => {
        file.children.Struct.forEach(s => {
            partialEntityMap.set(s.name, {
                ...s,
                schema: schemaLookup.get(s.name)
            })
        })
        file.children.Enum.forEach(e => partialEntityMap.set(e.name, e))

        file.children.Function.forEach(f => {
            const returnType = f.part.ReturnTypeSpec.differentiate()
            const param = f.part.Parameter.differentiate()
            
            partialEntityMap.set(f.name, {
                ...f, 
                returnType: returnType.kind === "CompleteType" ? getSchema(returnType, []) : returnType,
                parameter: param.kind === "NoParameter" ? param : {kind: "WithParam", name: param.name, schema: getSchema(param.part.UnaryParameterType.part.CompleteType, [])},
                body: f.part.FunctionBody.children.Statement,
                method: param.kind === "UnaryParameter" ? "POST" : "GET",
            })
        })
        file.children.StoreDefinition.forEach(s => {
            const innerType = validateGlobal(s)
            const schema = getSchema(s.part.CompleteType, [])
            if (schema.kind !== "Array") {
                throw Error(`Globals must be arrays`)
            }
            if (schema.data[0].kind !== "Object") {
                throw Error(`Global arrays must contain structs`)
            }

            partialEntityMap.set(s.name, {
                kind: "HierarchicalStore",
                name: s.name,
                typeName: innerType.name,
                schema: schema.data[0],
                specName: `querySpec_${s.name}`
                
            })
            
        })
    })

    return [partialEntityMap, (t) => getSchema(t, [])]
}