import { OpFactory, OpInstance } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes, Parse } from "conduit_parser";
import { Parameter } from 'conduit_parser/dist/src/main/entity/resolved';

export type WritableFunction = Readonly<{
    name: string
    method: "POST" | "GET"
    body: OpInstance[],
    parameter: Parameter
    maximumNumberOfVariables: number
}>

export const functionToByteCode: Utilities.StepDefinition<
{manifest: CompiledTypes.Manifest, opFactory: OpFactory}, 
{functions: WritableFunction[]}> = {
    stepName: "Converting function to byte code",
    func({manifest, opFactory}) {   

        const functions: WritableFunction[] = []
        const gatheredFunctions: CompiledTypes.Function[] = []
        manifest.inScope.forEach(f => {
            if (f.kind === "Function") {
                gatheredFunctions.push(f)
            }
        })
        
        gatheredFunctions.forEach(f => {
            try {
                functions.push(convertFunction(f, opFactory, manifest.inScope))
            } catch (e) {
                throw Error(`Within function ${f.name}: ${e}`)
            }  
        })
        
        
        
        return Promise.resolve({functions})
    }
}

interface VarMapEntryI{
    readonly id: number,
    readonly type: CompiledTypes.RealType
}

class VarMapEntry implements VarMapEntryI{
    readonly id: number
    readonly type: CompiledTypes.RealType

    constructor(id: number, type: CompiledTypes.RealType) {
        this.id = id 
        this.type = type
    }
}

class VarMap extends Map<string, VarMapEntryI> {
    private count = 0
    maximumVars = 0

    public add(s: string, t: CompiledTypes.RealType): number {
        super.set(s, new VarMapEntry(this.count, t));
        const v = this.count++
        this.maximumVars = Math.max(this.maximumVars, v)
        return v
    }
    
    public get(s: string): VarMapEntryI {
        const ret = super.get(s)
        if (ret === undefined) {
            throw Error(`Failure looking up variable ${s}`)
        }
        return ret
    }

    public tryGet(s: string): VarMapEntryI | undefined {
        return super.get(s)
    }
}

function typesAreEqual(l: CompiledTypes.RealType, r: CompiledTypes.RealType): boolean {
    return l.isArray === r.isArray &&
    l.val.name === r.val.name
}

type CompilationTools = Readonly<{
    varmap: VarMap,
    factory: OpFactory,
    inScope: CompiledTypes.ScopeMap
}>

// TODO: get rid of real type
function assignableToOp(a: Parse.Assignable, targetType: CompiledTypes.RealType | Parse.CustomTypeEntity, {varmap, factory, inScope}: CompilationTools): OpInstance {
    const assign = a.differentiate()
    const ref = varmap.tryGet(assign.val)
    if (ref !== undefined) {
        
        if (targetType.kind !== "CustomType" && !typesAreEqual(targetType, ref.type)) {
            throw Error(`Types are not equal`)
        }
        return factory.echoVariable(ref.id)
    } else {
        const store  = inScope.getEntityOfType(assign.val, "HierarchicalStore")
        if (targetType.kind !== "CustomType" && (store.typeName !== targetType.val.name || !targetType.isArray)) {
            throw Error(`The store contains a different type than the one desired`)
        }
        
        return factory.makeQuery(store)
    }
}


function convertFunction(f: CompiledTypes.Function, factory: OpFactory, inScope: CompiledTypes.ScopeMap): WritableFunction {
    const body: OpInstance[] = []
    const varmap = new VarMap()
    const parameter = f.parameter.differentiate()
    if (parameter.kind === "UnaryParameter") {
        varmap.add(parameter.name, parameter.type)
    }

    for (let j = 0; j < f.body.statements.length; j++) {
        const stmt = f.body.statements[j].differentiate()
        switch(stmt.kind) {
            
            case "Append":
                const v = varmap.get(stmt.variableName)
                const sto = inScope.getEntityOfType(stmt.storeName, "HierarchicalStore")
                if (v.type.isArray) {
                    throw Error(`Cannot insert arrays`)
                }
                if (v.type.val.name !== sto.typeName) {
                    throw Error(`Inserting unequal type`)
                }
                body.push(factory.makeInsert(sto, v.id))
                break
            
            case "VariableCreation":
                body.push(
                    assignableToOp(stmt.part.Assignable, stmt.part.CustomType, {varmap, factory, inScope})
                )
                varmap.add(stmt.name, {kind: "real type", isArray: stmt.part.CustomType.modification === "array", val: inScope.getEntityOfType(stmt.part.CustomType.type, "Struct")})
                body.push(
                    factory.savePreviousAsVariable()
                )
                break
            case "ReturnStatement":
                const e = stmt.part.Returnable.differentiate()
                switch (e.kind) {
                    case "Nothing":
                        if (f.returnType.kind === "real type") {
                            throw Error(`Returning nothing when you need to return a real type`)
                        }
                        // TODO: add a symbol for creating none and returning previous
                        break
                    case "Assignable":
                        const a = e.differentiate()
                        
                        if (f.returnType.kind === "VoidReturnType") {
                            throw Error(`Returning something when you need to return nothing`)
                        }
                        body.push(
                            assignableToOp(e, f.returnType, {varmap, factory, inScope}),
                            factory.makeReturnPrevious()
                        )
                        
                        break
                    default: Utilities.assertNever(e)
                }
                                
                
                break

            default: Utilities.assertNever(stmt)
        }
    }
    if (f.returnType.kind !== "VoidReturnType" && body.length === 0) {
        throw Error(`Function does nothing when it should return a type`)
    }

    return {
        name: f.name,
        method: f.method,
        body,
        parameter: f.parameter,
        maximumNumberOfVariables: varmap.maximumVars
    }
}