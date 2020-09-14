import { TypeModifierUnion } from '../lexicon';

import { Parse } from '../parse';
import { FileLocation } from '../utils';
import { Struct, EntityMap, HierarchicalStore,CommanderColumn, Function } from '../entity/resolved';
import { assertNever } from '../utils';
import  * as basic from '../entity/basic';
import { Primitives, TypeModifiers, Symbol } from '../lexicon';
export type PartialEntityMap<T=undefined> = Map<string, Struct | basic.Enum | Function | HierarchicalStore | T>


type FirstPassEntity = (Parse.Struct | basic.Enum | Parse.Function | Parse.StoreDefinition) & {file: FileLocation}
type ParentTypeInfo = Readonly<{kind: "type", name: string} | {kind: "modification", mod: TypeModifierUnion}>


export function toEntityMap(unresolved: Parse.File[]): PartialEntityMap {
    const firstPassScope: Map<string, FirstPassEntity> = new Map()
    const childType: (keyof Parse.File["children"])[] = ["Struct", "Enum", "Function", "StoreDefinition"]
    unresolved.forEach(file => {
        childType.forEach((type) => {
            file.children[type].forEach((ent: Parse.Struct | basic.Enum | Parse.Function | Parse.StoreDefinition) => {
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


    const secondPassScope: PartialEntityMap = new Map()


    function ensureTypeIsValid(type: Parse.CompleteType, info: ParentTypeInfo[]): void {
        const t = type.differentiate()
        const last: ParentTypeInfo | undefined = info.length >= 1 ? info[info.length - 1] : undefined
        switch (t.kind) {
            case "TypeName":
                
                if (info.some(p => p.kind === "type" && p.name === t.name)) {
                    throw Error(`Type invalid because ${t.name} is recursive`)
                }

                const ref = firstPassScope.get(t.name)
                if (ref === undefined) {
                    throw Error(`${t.name} does not refer to any known entity`)
                }
                if (last !== undefined && last.kind === "modification" && last.mod === Symbol.Ref) {
                    if (ref.kind !== "StoreDefinition") {
                        throw Error(`References should be to globals, not ${ref.kind}`)
                    }
                    break
                }
            
                if (ref.kind !== "Struct" && ref.kind !== "Enum") {
                    throw Error(`Name ${t.name} refers to a ${ref.kind} but expected a type`)
                }
        
                
                if (!secondPassScope.has(t.name)) {
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
                            break
                        case "Struct":
                            info.push({kind: "type", name: ref.name})
                            ref.children.Field.forEach(f => {
                                ensureTypeIsValid(f.part.CompleteType, info)
                            })
                            info.pop()
                            break
                        default: assertNever(ref)
                    }
                    
                    secondPassScope.set(t.name, ref)
                }
                break
                
            case "Primitive":
                if (last !== undefined && last.kind === "modification") {
                    if (last.mod === Symbol.Ref) {
                        throw Error(`References may only be made to structs stored at the global level.`)
                    }
                }
                
                break
            case "DetailedType":
                
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
                        break
                    case Symbol.Ref:
                        if (last !== undefined && last.kind === "modification") {
                            switch (last.mod) {
                                case Symbol.Array:
                                    break
                                case Symbol.Optional:
                                    throw Error(`Optional references aren't allowed`)
                                case Symbol.Ref:
                                    throw Error(`Holding a reference to a reference is not allowed`)
                                case Symbol.none:
                                    break
                                default: assertNever(last.mod)
                            }
                        }

                    case Symbol.none:
                        break
                    default: assertNever(t.modification)
                }

                info.push({kind: "modification", mod: t.modification})
                ensureTypeIsValid(t.part.CompleteType, info)
                info.pop()
                break

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
                ensureTypeIsValid({kind: "CompleteType", differentiate: () => ({kind: "TypeName", name: en.name})}, [])
                break
            
        }
    })

    function completeTypeToCommanderColumn(type: Parse.CompleteType, modifier: TypeModifierUnion, tablename: string, fieldname: string): CommanderColumn {
        
        const t= type.differentiate()
        switch(t.kind) {
            case "TypeName":
                const ref = secondPassScope.get(t.name) as Struct | basic.Enum
                if (ref.kind === "Struct") {
                    switch (modifier) {
                        case Symbol.Array:
                            return {
                                dif: "1:many",
                                type: ref,
                                fieldName: fieldname,
                                ref: structToHierarchicalStore(ref, `${tablename}_${fieldname}`),
                                refTableName: `rel_${tablename}_and_${fieldname}`
                            }
                        case Symbol.Optional:
                        case Symbol.none:
                            return {
                                dif: "1:1",
                                type: ref,
                                columnName: `${fieldname}_ptr`,
                                fieldName: fieldname,
                                ref: structToHierarchicalStore(ref, `${tablename}_${fieldname}`),
                                modification: modifier
                            }
                        case Symbol.Ref:
                            throw Error(`Currently don't support storing references within a store`)
                            
                        default: assertNever(modifier)
                    }
                    
                } else {
                    switch (modifier) {
                        case Symbol.Optional:
                            throw Error(`Cannot have optional enum columns`)
                        case Symbol.Ref:
                            throw Error(`Reffing an enum doesn't make any sense`)
                    }
                    
                    return {
                        dif: "enum",
                        type: ref,
                        columnName: fieldname,
                        fieldName: fieldname,
                        modification: modifier
                    }
                }
            case "Primitive":
                switch (modifier) {
                    
                    case Symbol.Ref:
                        throw Error(`Reffing a primitive doesn't make any sense`)
                }
                return {
                    dif: "prim",
                    modification: modifier,
                    type: t,
                    columnName: fieldname,
                    fieldName: fieldname
                }
            case "DetailedType":
                if (modifier !== Symbol.none) {
                    throw Error(`Invalid modification of stored type`)
                }
                return completeTypeToCommanderColumn(t.part.CompleteType, t.modification, tablename, fieldname)

            default: assertNever(t)
        }
    }

    function structToHierarchicalStore(struct: Struct, tablename: string): HierarchicalStore {
        return {
            kind: "HierarchicalStore",
            name: tablename, 
            columns: struct.children.Field.map(f => {
                return completeTypeToCommanderColumn(
                    f.part.CompleteType, Symbol.none, tablename, f.name)
            }), 
            typeName: struct.name,
            specName: `querySpec_${tablename}`
        }
    }
    firstPassScope.forEach(en => {
        switch(en.kind) {
            case "Function":
                
                const returnType = en.part.ReturnTypeSpec.differentiate()
                if (returnType.kind === "CompleteType") {
                    ensureTypeIsValid(returnType, [])
                }
                const parameter = en.part.Parameter.differentiate()
                if (parameter.kind === "UnaryParameter"){
                    ensureTypeIsValid(parameter.part.UnaryParameterType.part.CompleteType, [])
                }

                secondPassScope.set(en.name, {
                    kind: "Function",
                    returnType,
                    parameter: en.part.Parameter,
                    body: en.part.FunctionBody.children.Statement,
                    method: parameter.kind === "UnaryParameter" ? "POST" : "GET",
                    name: en.name
                })
                break
            case "StoreDefinition":
                const innerType = validateGlobal(en)
                ensureTypeIsValid(en.part.CompleteType, [])
                const struct = secondPassScope.get(innerType.name)
                if (struct.kind !== "Struct") {
                    throw Error(`Can only store structs at global level`)
                }

                secondPassScope.set(en.name, structToHierarchicalStore(struct, en.name))
                const refName = `${en.name}Ref`
                if (secondPassScope.has(refName)) {
                    throw Error(`${refName} collides with system generated struct. Please rename.`)
                }
                secondPassScope.set(`${en.name}Ref`, 
                    {
                        kind: "Struct", 
                        isConduitGenerated: true, 
                        name: refName,
                        children: {
                            Field: [
                                {
                                    kind: "Field",  name: "conduit_entity_id" , part: {
                                        CompleteType: {
                                            kind: "CompleteType",
                                            differentiate: () => ({
                                                kind: "Primitive",
                                                type: Symbol.int
                                            })
                                        }
                                    }
                                }
                            ]
                        }
                    }
                    )
               break

            case "Enum":
            case "Struct":
                break
            default: assertNever(en)
        }
    })
    return secondPassScope

}