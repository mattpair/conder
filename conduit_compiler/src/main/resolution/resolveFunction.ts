import { Parse } from '../parse';
import { TypeResolved, FunctionResolved, Message, Function, Enum, EntityMap } from "../entity/resolved";
import { assertNever } from "../util/classifying";
import { VoidReturn } from '../entity/basic';



function getReturnType(type: Parse.ReturnTypeSpec, namespace: TypeResolved.Namespace): Message | VoidReturn {
    const ent = type.differentiate()
    switch (ent.kind) {
        case "CustomType":
            const t = namespace.inScope.get(ent.type)
            if (t === undefined || t.kind === "Function" || t.kind === "Enum" ) {
                throw new Error(`Invalid return type ${t}`)
            }
            return t

        case "VoidReturnType":
            return ent

        default: assertNever(ent)
    }
}

function resolveParameter(namespace: TypeResolved.Namespace, parameter: Parse.Parameter): FunctionResolved.Parameter {
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
            
            const parameterType = namespace.inScope.getEntityOfType(type.type, "Message")
            
            if (parameterType === undefined ) {
                throw new Error(`Invalid parameter type ${parameterType}`)
            } 
            
            return {
                kind: "Parameter",
                
                differentiate: () => ({
                    kind: "UnaryParameter",
                    name: param.name,
                    loc: param.loc,
                    part: {
                        UnaryParameterType: {
                            kind: "UnaryParameterType",
                            differentiate: () => parameterType
                        }
                    }
                })
            }

    }
} 


function resolveFunction(namespace: TypeResolved.Namespace, func: Function): FunctionResolved.Function {
    
    const Parameter = resolveParameter(namespace, func.part.Parameter)
    const paramInstance = Parameter.differentiate()
    
    const returnType = getReturnType(func.part.ReturnTypeSpec, namespace)

    const ret = func.part.FunctionBody.children.Statement.find((s: Parse.Statement) => s.differentiate().kind === "ReturnStatement")
    if (ret !== undefined) {
        const name = ret.differentiate().val
        
        if (paramInstance.kind === "NoParameter") {
            throw new Error(`Cannot find variable in scope ${name}`)
        }

        switch (returnType.kind) {
            case "Message":
                if (returnType.name !== paramInstance.part.UnaryParameterType.differentiate().name) {
                    throw new Error(`Expected a ${returnType.name} but returned a ${paramInstance.part.UnaryParameterType.differentiate().name}`)
                }
                break
                
            case "VoidReturnType":
                throw new Error(`Returning [${name}] which is of type ${paramInstance.part.UnaryParameterType.differentiate().name} but expected void return`)
            default: assertNever(returnType)
        }
    } else {
        if (returnType.kind !== "VoidReturnType") {
            throw new Error(`No return yet expected a ${returnType.name}`)
        }
    }
    return {
        kind: "Function",
        loc: func.loc,
        name: func.name,
        file: func.file,
        part: {
            FunctionBody: func.part.FunctionBody,
            Parameter,
            ReturnTypeSpec: {
                kind: "ReturnTypeSpec",
                differentiate: () => returnType
            }
        }
    }
}

export function resolveFunctions(namespace: TypeResolved.Namespace): FunctionResolved.Manifest {

    const functions: FunctionResolved.Function[] = []
    const entityMapInternal: Map<string, Message | Enum | FunctionResolved.Function> = new Map()
    
    
    namespace.inScope.forEach(val => {
        if (val.kind === "Function") {
            const func = resolveFunction(namespace, val)
            functions.push(func)
            entityMapInternal.set(val.name, func)
        } else {
            entityMapInternal.set(val.name, val)
        }
    })

    return {
        namespace: {name: "default", inScope: new EntityMap(entityMapInternal)},
        service: {
            functions,
            kind: "public"
        }
    }
}