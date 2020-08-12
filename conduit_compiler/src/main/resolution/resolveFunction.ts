import { Parse } from '../parse';
import { Manifest, Function, Statement, Struct, Enum, EntityMap, HierarchicalStore, ReturnType, Parameter, FunctionBody, Variable, Field } from "../entity/resolved";
import { TypeResolved } from "../entity/TypeResolved";
import { assertNever } from "../utils";



function getReturnType(type: Parse.ReturnTypeSpec, namespace: TypeResolved.Namespace): ReturnType {
    const ent = type.differentiate()
    switch (ent.kind) {
        case "CustomType":
            return {
                val: namespace.inScope.getEntityOfType(ent.type, "Struct"), 
                isArray: ent.modification === "array",
                kind: "real type"
            }

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
            
            const parameterType = namespace.inScope.getEntityOfType(type.type, "Struct")
            
            return {
                kind: "Parameter",
                
                differentiate: () => ({
                    kind: "UnaryParameter",
                    name: param.name,
                    loc: param.loc,
                    type: {
                        kind: "real type",
                        val: parameterType,
                        isArray: type.modification === "array"
                    }
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
    const resolved: Statement[] = []
    let hitReturnStatement = false
    for (let i = 0; i < func.part.FunctionBody.children.Statement.length; i++) {
        const stmt = func.part.FunctionBody.children.Statement[i].differentiate();
        let resolvedStmt: Exclude<Statement, {kind: "ReturnStatement"}>
        switch (stmt.kind) {
            case "Append": {
                const variable = variableLookup.get(stmt.variableName)
                if (variable === undefined) {
                    throw Error(`Cannot find variable ${stmt.variableName}`)
                }
                const into = namespace.inScope.getEntityOfType(stmt.storeName, "HierarchicalStore")
                if (into.typeName !== variable.type.val.name) {
                    throw Error(`Cannot store ${variable.name} in ${into.name} because it stores ${into.typeName}`)
                }
                resolvedStmt = {
                    kind: "Append",
                    loc: stmt.loc,
                    inserting: variable,
                    into,
                    returnType: {kind: "VoidReturnType"}
                }

                break
            }

            case "VariableReference": {
                const variable = variableLookup.get(stmt.val)
                if (variable === undefined) {
                    const store = namespace.inScope.getEntityOfType(stmt.val, "HierarchicalStore")
                    resolvedStmt = {
                        kind: "StoreReference",
                        loc: stmt.loc,
                        from: store,
                        returnType: { kind: "real type", isArray: true, val: namespace.inScope.getEntityOfType(store.typeName, "Struct")}
                    }
                   break
                }
                resolvedStmt = {
                    kind: "VariableReference",
                    loc: stmt.loc,
                    name: stmt.val,
                    type: variable.type,
                    returnType: {kind: "real type", isArray: variable.type.isArray, val: variable.type.val}
                }
                break
            }
            case "ReturnStatement":
                if (hitReturnStatement) {
                    throw Error(`Double return doesn't make any sense`)
                }
                
                resolved.push({
                    kind: "ReturnStatement",
                    loc: stmt.loc,
                })
                hitReturnStatement = true

                continue

            default: assertNever(stmt)
        }
        resolved.push(resolvedStmt)

        if (hitReturnStatement) {
            if (ret.kind === "VoidReturnType" && resolvedStmt.returnType.kind !== "VoidReturnType") {
                throw Error(`Returning ${resolvedStmt.returnType.val.name} but expected void return`)
            }
            if (ret.kind === "real type" && resolvedStmt.returnType.kind === "real type") {
                if (!(ret.val === resolvedStmt.returnType.val && ret.isArray === resolvedStmt.returnType.isArray)) {
                    throw Error(`Cannot return ${JSON.stringify(resolvedStmt.returnType, null, 2)} because exepected return type: ${JSON.stringify(ret, null, 2)}`)
                }

            } else {
                throw Error(`Mismatch return types: expected ${ret.kind}\nreceived ${resolvedStmt.kind}`)
            }
            break
        }
    }
    if (resolved.length === 0 && ret.kind !== "VoidReturnType") {
        throw Error(`Function expects non-void return type but there are no statements`)
    }

    if (ret.kind === "real type" && resolved.find(r => r.kind === "ReturnStatement") === undefined) {
        throw Error(`Function expected a real return type, but there is no return statement`)
    }
    return {
        kind: "FunctionBody",
        loc: func.part.FunctionBody.loc,
        statements: resolved
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
        requiresDbClient: f.statements.some(s => ["Append", "StoreReference"].includes(s.kind)),
        returnType: returnType,
        parameter,
        body: f,
        method: parameter.differentiate().kind === "NoParameter" ? "GET" : "POST"
    }
}

type InternalMap = Map<string, Struct | Enum | Function | HierarchicalStore>

export function resolveFunctions(namespace: TypeResolved.Namespace): Manifest {

    const entityMapInternal: InternalMap = new Map()
    
    
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

    return {
        inScope: new EntityMap(entityMapInternal),
    }
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
                            differentiate: () => ({kind: "custom", name: col.ref.specName}),
                            modification: "none"
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