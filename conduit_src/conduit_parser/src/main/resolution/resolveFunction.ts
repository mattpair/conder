import { ResolvedType } from './../entity/resolved';
import { Parse } from '../parse';
import { Function, FunctionBody, ScopeMap, Struct, Enum, EntityMap, HierarchicalStore, ReturnType, Parameter, Variable, Field } from "../entity/resolved";
import { TypeResolved, isPrimitive } from "../entity/TypeResolved";
import { assertNever } from "../utils";


function resolveType(c: Parse.CustomTypeEntity, namespace: TypeResolved.Namespace): ResolvedType {
    
    let parameterType: ResolvedType = isPrimitive(c) 
        
    if (parameterType === undefined) {
        const struct = namespace.inScope.getEntityOfType(c.type, "Struct")
        parameterType = {kind: "CustomType", type: struct.name, modification: c.modification}
    }

    return parameterType
}

function getReturnType(type: Parse.ReturnTypeSpec, namespace: TypeResolved.Namespace): ReturnType {
    const ent = type.differentiate()
    switch (ent.kind) {
        case "CustomType":
            return resolveType(ent, namespace)

        case "VoidReturnType":
            return ent

        default: assertNever(ent)
    }
}

function resolveParameter(namespace: TypeResolved.Namespace, parameter: Parse.Parameter): Parameter {
    const param = parameter.differentiate()
    switch (param.kind) {
        case "NoParameter":
            return {
                kind: "Parameter",
                differentiate: () => param
            }
            
        case "UnaryParameter":
            if (namespace.inScope.has(param.name)) {
                throw new Error(`Parameter: ${param.name} duplicates another entity in scope`)
            }
            
            const type: Parse.CustomTypeEntity = param.part.UnaryParameterType.differentiate()
            
            const parameterType: ResolvedType = resolveType(type, namespace)
            
            return {
                kind: "Parameter",
                
                differentiate: () => ({
                    kind: "UnaryParameter",
                    name: param.name,
                    loc: param.loc,
                    type: parameterType
                })
            }

    }
}


function resolveFunctionBody(namespace: TypeResolved.Namespace, func: TypeResolved.Function, parameter: Parameter, ret: ReturnType): FunctionBody {
    
    const variableLookup = new Map<string, Variable>()
    const p = parameter.differentiate()
    switch(p.kind) {

        case "NoParameter":
            break;
        case "UnaryParameter":
            
            variableLookup.set(p.name, {
                name: p.name,
                type: p.type
            })
            break;

        default: assertNever(p)
    }
    
    return {
        kind: "FunctionBody",
        loc: func.part.FunctionBody.loc,
        statements: func.part.FunctionBody.children.Statement
    }
}


function resolveFunction(namespace: TypeResolved.Namespace, func: TypeResolved.Function): Function {
    const parameter = resolveParameter(namespace, func.part.Parameter)
    const returnType = getReturnType(func.part.ReturnTypeSpec, namespace)

    const f = resolveFunctionBody(namespace, func, parameter, returnType)
    

    return {
        kind: "Function",
        loc: func.loc,
        name: func.name,
        returnType: returnType,
        parameter,
        body: f,
        method: parameter.differentiate().kind === "NoParameter" ? "GET" : "POST"
    }
}

export type PartialEntityMap<T=undefined> = Map<string, Struct | Enum | Function | HierarchicalStore | T>

export function resolveFunctions(namespace: TypeResolved.Namespace): PartialEntityMap {

    const entityMapInternal: PartialEntityMap = new Map()
    
    
    namespace.inScope.forEach(val => {
        if (val.kind === "Function") {
            const func = resolveFunction(namespace, val)
            entityMapInternal.set(val.name, func)
        } else {
            entityMapInternal.set(val.name, val)
        }
    })

    //Add system generated stuff here... move eventually
    namespace.inScope.forEach(v => {
        switch(v.kind) {
            case "HierarchicalStore":
                
                generateSystemStructs(v).forEach(struct => {
                    if (entityMapInternal.has(struct.name)) {
                        throw Error(`Unexpected collision on struct name ${struct.name}`)
                    }
                    entityMapInternal.set(struct.name, struct)
                })
                
        }
    })

    return entityMapInternal
}

function generateSystemStructs(store: HierarchicalStore): Struct[] {

    const fields: Field[] = []
    const children: Struct[] = []
    store.columns.forEach(col => {
        switch (col.dif) {
            case "prim":
            case "enum":
                // plainColumnStrs.push(`const ${store.name}_${col.columnName}: &'static str = "${col.columnName}";`)
                break

            case "1:many":
            case "1:1":
                fields.push({
                    kind: "Field", 
                    part: {
                        FieldType: {
                            kind: "FieldType",
                            differentiate: () => ({kind: "CustomType", type: col.ref.specName, modification: "none"}),
                            
                        }
                    },
                    name: col.fieldName
                })
                children.push(...generateSystemStructs(col.ref))
                break

            default: assertNever(col)
        }
    })
    return [...children, {
        kind: "Struct", 
        name: store.specName, 
        children: {
            Field: fields
        },
        isConduitGenerated: true
    }]
}