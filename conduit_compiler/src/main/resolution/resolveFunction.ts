import { Parse } from '../parse';
import { TypeResolved, FunctionResolved, Message } from "../entity/resolved";
import { assertNever } from "../util/classifying";
import { Enum, VoidReturn } from '../entity/basic';

type ChildType<T, K extends keyof T> =  T[K]
type ScopeMap = ChildType<TypeResolved.File, "inFileScope">

function getFromEntitySelect(type: Parse.FromEntitySelect, scope: ScopeMap): Message | Enum {
    const externalFile = scope.get(type.from)
    if (externalFile.kind !== "File") {
        throw new Error(`${type.from} is a ${externalFile.kind} and cannot be selected`)
    }
    return Object.assign(getCustomType(type.part.CustomType, externalFile.inFileScope), {declaredIn: externalFile.loc})
}

function getCustomType(type: Parse.CustomTypeEntity, scope: ScopeMap ): Message | Enum {
    const ent = scope.get(type.type)
    if (ent === undefined) {
        throw new Error(`Unable to find ${type.type}`)
    }

    switch(ent.kind) {
        case "Message":
        case "Enum":
            return ent

        case "File":
            throw new Error(`Type ${type.type} is invalid since it references an import alias, which is not a type.`)

        default: assertNever(ent)
    }
}

function getReturnType(type: Parse.ReturnTypeSpec, scope: ScopeMap): Message | Enum | VoidReturn {
    const ent = type.differentiate()
    switch (ent.kind) {
        case "CustomType":
            return getCustomType(ent, scope)
        case "FromEntitySelect":
            return getFromEntitySelect(ent, scope)

        case "VoidReturnType":
            return ent

        default: assertNever(ent)
    }
}

function resolveParameter(file: TypeResolved.File, parameter: Parse.Parameter): FunctionResolved.Parameter {
    const param = parameter.differentiate()
    switch (param.kind) {
        case "NoParameter":
            return {
                kind: "Parameter",
                differentiate: () => param
            }
            
        case "UnaryParameter":
            if (file.inFileScope.has(param.name)) {
                throw new Error(`Parameter: ${param.name} duplicates another entity in scope`)
            }
            
            const type: Parse.CustomTypeEntity | Parse.FromEntitySelect = param.part.UnaryParameterType.differentiate()
            
            let parameterType: Message | Enum = null
            switch(type.kind) {
                
                case "CustomType":

                    parameterType = getCustomType(type, file.inFileScope)
                    break
                    
                case "FromEntitySelect":
                    parameterType = getFromEntitySelect(type, file.inFileScope)
                    break;
                default: assertNever(type)
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


function resolveFunction(file: TypeResolved.File, func: Parse.Function): FunctionResolved.Function {
    if (file.inFileScope.has(func.name)) {
        throw new Error(`Function: ${func.name} duplicates another entity in scope`)
    }
    const scopeLookup: Record<string, Message | Enum> = {}
    const Parameter = resolveParameter(file, func.part.Parameter)
    const paramInstance = Parameter.differentiate()
    if (paramInstance.kind === "UnaryParameter") {
        scopeLookup[paramInstance.name] = paramInstance.part.UnaryParameterType.differentiate()
    }
    
    
    

    const returnType = getReturnType(func.part.ReturnTypeSpec, file.inFileScope)

    const ret = func.part.FunctionBody.children.Statement.find((s: Parse.Statement) => s.differentiate().kind === "ReturnStatement")
    if (ret !== undefined) {
        const name = ret.differentiate().val
        const v = scopeLookup[name]
        if (v === undefined) {
            throw new Error(`Cannot find variable in scope ${name}`)
        }

        switch (returnType.kind) {
            case "Enum":
            case "Message":
                if (returnType.name !== v.name) {
                    throw new Error(`Expected a ${returnType.name} but returned a ${v.name}`)
                }
                break
                
            case "VoidReturnType":
                throw new Error(`Returning [${name}] which is of type ${v.name} but expected void return`)
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

export function resolveFunctions(file: TypeResolved.File): FunctionResolved.File {
    return {
        kind: "File",
        children: {
            Function: file.children.Function.map(f => resolveFunction(file, f)),
            Import: file.children.Import
        },
        loc: file.loc,
        inFileScope: file.inFileScope
    }
}