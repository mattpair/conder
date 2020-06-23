import { Parse } from '../parse';
import { TypeResolved } from "../entity/resolved";
import { assertNever } from "../util/classifying";
import { Enum, VoidReturn } from '../entity/basic';

function getFromEntitySelect(type: Parse.FromEntitySelect, scope: TypeResolved.ScopeMap): TypeResolved.Message | Enum {
    const externalFile = scope.get(type.from)
    if (externalFile.kind !== "File") {
        throw new Error(`${type.from} is a ${externalFile.kind} and cannot be selected`)
    }
    return getCustomType(type.part.CustomType, externalFile.inFileScope)
}

function getCustomType(type: Parse.CustomTypeEntity, scope: TypeResolved.ScopeMap ): TypeResolved.Message | Enum {
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

function getReturnType(type: Parse.ReturnTypeSpec, scope: TypeResolved.ScopeMap): TypeResolved.Message | Enum | VoidReturn {
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


export function validateFunctions(files: TypeResolved.File[]) {
    files.forEach(file => {
        file.children.Function.forEach(func => {
            if (file.inFileScope.has(func.name)) {
                throw new Error(`Function: ${func.name} duplicates another entity in scope`)
            }
            
            const parameter = func.part.Parameter.differentiate()

            const scopeLookup: Record<string, TypeResolved.Message | Enum> = {}
            switch (parameter.kind) {
                case "NoParameter":
                    break
                case "UnaryParameter":
                    if (file.inFileScope.has(parameter.name)) {
                        throw new Error(`Parameter: ${parameter.name} duplicates another entity in scope`)
                    }
                    
                    const type: Parse.CustomTypeEntity | Parse.FromEntitySelect = parameter.part.UnaryParameterType.differentiate()
    
                    switch(type.kind) {
                        case "CustomType":
                            scopeLookup[parameter.name] = getCustomType(type, file.inFileScope)
                            break
                        case "FromEntitySelect":
                            scopeLookup[parameter.name] = getFromEntitySelect(type, file.inFileScope)
                            break
    
                        default: assertNever(type)
                    }

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

        })
    })
}