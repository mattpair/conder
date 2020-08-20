import { assertNever } from 'conduit_parser/dist/src/main/utils';
import { OpFactory, OpInstance } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes } from "conduit_parser";
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
            
            case "ReturnStatement":
                const e = stmt.part.Returnable.differentiate()
                switch (e.kind) {
                    case "Nothing":
                        if (f.returnType.kind === "real type") {
                            throw Error(`Returning nothing when you need to return a real type`)
                        }
                        // TODO: add a symbol for creating none and returning previous
                        break
                    case "VariableReference":
                        if (f.returnType.kind === "VoidReturnType") {
                            throw Error(`Returning something when you need to return nothing`)
                        }
                        const ref = varmap.tryGet(e.val)
                        if (ref !== undefined) {
                            
                            if (!typesAreEqual(f.returnType, ref.type)) {
                                throw Error(`Returning an unequal type`)
                            }
                            body.push(factory.makeReturnVariableOp(ref.id))
                        } else {
                            const store  = inScope.getEntityOfType(e.val, "HierarchicalStore")
                            if (store.typeName !== f.returnType.val.name || !f.returnType.isArray) {
                                throw Error(`Returning a store won't do here`)
                            }
                            body.push(
                                factory.makeQuery(store),
                                factory.makeReturnPrevious()
                            )
                        }
                        
                        break
                    default: assertNever(e)
                }
                                
                
                break

            default: continue
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