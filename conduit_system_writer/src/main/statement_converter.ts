import { CompleteOpFactory, OpInstance } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes, Parse, isPrimitive } from "conduit_parser";
import { Parameter } from 'conduit_parser/dist/src/main/entity/resolved';

export type WritableFunction = Readonly<{
    name: string
    method: "POST" | "GET"
    body: OpInstance[],
    parameter: Parameter
    maximumNumberOfVariables: number
}>

export const functionToByteCode: Utilities.StepDefinition<
{manifest: CompiledTypes.Manifest, opFactory: CompleteOpFactory}, 
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
    readonly type: CompiledTypes.ResolvedType
}

class VarMapEntry implements VarMapEntryI{
    readonly id: number
    readonly type: CompiledTypes.ResolvedType

    constructor(id: number, type: CompiledTypes.ResolvedType) {
        this.id = id 
        this.type = type
    }
}

class VarMap extends Map<string, VarMapEntryI> {
    private count = 0
    maximumVars = 0

    public add(s: string, t: CompiledTypes.ResolvedType): number {
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

function typesAreEqual(l: CompiledTypes.ResolvedType, r: CompiledTypes.ResolvedType): boolean {
    return l.kind === r.kind &&
    l.modification === r.modification &&
    (
        (
            l.kind === "CustomType"
            //@ts-ignore
            && l.type === r.type
        ) 
    || l.kind === "Primitive")
}

type CompilationTools = Readonly<{
    varmap: VarMap,
    factory: CompleteOpFactory,
    inScope: CompiledTypes.ScopeMap
}>

function assignableToOp(a: Parse.Assignable, targetType: CompiledTypes.ResolvedType, {varmap, factory, inScope}: CompilationTools): OpInstance {
    const assign = a.differentiate()
    const ref = varmap.tryGet(assign.val)
    if (ref !== undefined) {
        
        if (!typesAreEqual(targetType, ref.type)) {
            throw Error(`Types are not equal`)
        }
        return factory.echoVariable(ref.id)
    } else {
        const store  = inScope.getEntityOfType(assign.val, "HierarchicalStore")
        if (targetType.kind === "Primitive") {
            throw Error("Stores contain structured data, not primitives")
        }
        
        
        if (store.typeName !== targetType.type || targetType.modification  !== "array") {
            throw Error(`The store contains a different type than the one desired`)
        }
        
        return factory.storeQuery(store)
    }
}


function convertFunction(f: CompiledTypes.Function, factory: CompleteOpFactory, inScope: CompiledTypes.ScopeMap): WritableFunction {
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
                if (!typesAreEqual(v.type, {kind: "CustomType", type: sto.typeName, modification: 'none'})) {
                    throw Error("attempting to insert unequal types into global array")
                }
                
                body.push(factory.storeInsert(sto, v.id))
                break
            
            case "VariableCreation":
                const prim = isPrimitive(stmt.part.CustomType)
                if (prim) {
                    throw Error(`Currently don't allow primitive variable creation`)
                }
                
                body.push(
                    assignableToOp(
                        stmt.part.Assignable, 
                        stmt.part.CustomType, 
                        {varmap, factory, inScope})
                )
                
                varmap.add(stmt.name, stmt.part.CustomType)
                body.push(
                    factory.savePrevious
                )
                break
            case "ReturnStatement":
                const e = stmt.part.Returnable.differentiate()
                switch (e.kind) {
                    case "Nothing":
                        if (f.returnType.kind !== "VoidReturnType") {
                            throw Error(`Returning nothing when you need to return a real type`)
                        }
                        // TODO: add a symbol for creating none and returning previous
                        break
                    case "Assignable":
                        
                        if (f.returnType.kind === "VoidReturnType") {
                            throw Error(`Returning something when you need to return nothing`)
                        }
                        body.push(
                            assignableToOp(e, f.returnType, {varmap, factory, inScope}),
                            factory.returnPrevious
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