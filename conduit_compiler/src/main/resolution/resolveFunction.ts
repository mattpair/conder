import { Parse } from '../parse';
import { WithArrayIndicator, TypeResolved, FunctionResolved, Struct, Function, Enum, EntityMap, Store, ResolvedType } from "../entity/resolved";
import { assertNever } from "../util/classifying";
import { VoidReturn } from '../entity/basic';



function getReturnType(type: Parse.ReturnTypeSpec, namespace: TypeResolved.Namespace): FunctionResolved.ReturnType {
    const ent = type.differentiate()
    switch (ent.kind) {
        case "CustomType":
            return {
                data: {val: namespace.inScope.getEntityOfType(ent.type, "Struct"), isArray: ent.isArray},
                kind: "typed return"
            }

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
            
            const parameterType = namespace.inScope.getEntityOfType(type.type, "Struct")
            
            return {
                kind: "Parameter",
                
                differentiate: () => ({
                    kind: "UnaryParameter",
                    name: param.name,
                    loc: param.loc,
                    part: {
                        UnaryParameterType: {
                            kind: "UnaryParameterType",
                            val: parameterType,
                            isArray: type.isArray
                        }
                    }
                })
            }

    }
}


function resolveFunctionBody(namespace: TypeResolved.Namespace, func: Function, parameter: FunctionResolved.Parameter, ret: FunctionResolved.ReturnType): FunctionResolved.FunctionBody {
    
    const variableLookup = new Map<string, FunctionResolved.Variable>()
    const p = parameter.differentiate()
    switch(p.kind) {

        case "NoParameter":
            break;
        case "UnaryParameter":
            
            variableLookup.set(p.name, {
                name: p.name,
                type: p.part.UnaryParameterType
            })
            break;

        default: assertNever(p)
    }
    const resolved: FunctionResolved.Statement[] = []
    let earlyExit = false
    for (let i = 0; i < func.part.FunctionBody.children.Statement.length; i++) {
        const stmt = func.part.FunctionBody.children.Statement[i].differentiate();
        
        switch (stmt.kind) {
            case "Insertion":{
                const variable = variableLookup.get(stmt.variableName)
                if (variable === undefined) {
                    throw Error(`Cannot find variable ${stmt.variableName}`)
                }
                const into = namespace.inScope.getEntityOfType(stmt.storeName, "StoreDefinition")
                if (into.stores !== variable.type.val) {
                    throw Error(`Cannot store ${variable.name} in ${into.name} because it stores ${into.stores.name}`)
                }

                resolved.push({
                    kind: "Insertion",
                    loc: stmt.loc,
                    inserting: variable,
                    into
                })

                break}
            case "ReturnStatement":
                const variable = variableLookup.get(stmt.val)
                if (variable === undefined) {
                    throw Error(`Cannot find variable ${stmt.val}`)
                }
                if (ret.kind === "VoidReturnType" ||
                    ret.data.isArray !== variable.type.isArray ||
                    ret.data.val.name !== variable.type.val.name
                ) {
                    throw Error(`Cannot return ${JSON.stringify(variable.type, null, 2)} because exepected return type: ${JSON.stringify(ret, null, 2)}`)
                }
                resolved.push({
                    kind: "ReturnStatement",
                    loc: stmt.loc,
                    val: variable
                })
                earlyExit = true

                break

            default: assertNever(stmt)
        }
        if (earlyExit) {
            break
        }
    }
    return {
        kind: "FunctionBody",
        loc: func.part.FunctionBody.loc,
        statements: resolved
    }
}


function resolveFunction(namespace: TypeResolved.Namespace, func: Function): FunctionResolved.Function {
    const parameter = resolveParameter(namespace, func.part.Parameter)
    const returnType = getReturnType(func.part.ReturnTypeSpec, namespace)

    const f = resolveFunctionBody(namespace, func, parameter, returnType)
    

    return {
        kind: "Function",
        loc: func.loc,
        name: func.name,
        requiresDbClient: f.statements.some(s => s.kind === "Insertion"),
        returnType: returnType,
        parameter,
        body: f
    }
}

export function resolveFunctions(namespace: TypeResolved.Namespace): FunctionResolved.Manifest {

    const functions: FunctionResolved.Function[] = []
    const entityMapInternal: Map<string, Struct | Enum | FunctionResolved.Function | Store> = new Map()
    
    
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