import { CompleteOpFactory, OpInstance } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes, Parse, Lexicon, isPrimitive } from "conduit_parser";
import { Parameter } from 'conduit_parser/dist/src/main/entity/resolved';

export type WritableFunction = Readonly<{
    name: string
    method: "POST" | "GET"
    body: OpContainer[],
    parameter: Parameter
    maximumNumberOfVariables: number
}>

export type OpContainer<S=string> = Readonly<{
    label?: number
    op: OpInstance<S>
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

type TargetType = CompiledTypes.ResolvedType | {kind: "any"}
type AllowGlobalReference = Exclude<CompiledTypes.Entity, {kind: "Enum" | "Struct" | "Function"}>

type GlobalReferenceToOps<K extends AllowGlobalReference["kind"]> = (
    global: Extract<AllowGlobalReference, {kind: K}>, 
    dots: Parse.DotStatement[],
    targetType: TargetType, 
    tools: CompilationTools) => OpContainer[]
type GlobalReferenceToOpsConverter = {
    [K in AllowGlobalReference["kind"]]: GlobalReferenceToOps<K>
}

const globalReferenceToOpsConverter: GlobalReferenceToOpsConverter = {
    python3: (module, dots, targetType, tools) => {
        if (dots.length !== 1) {
            throw Error(`Invalid reference to the installed python module ${module.name}`)
        }
        if (targetType.kind === "any") {
            throw Error(`Cannot determine what type python3 call should be.`)
        }

        if (targetType.modification !== "none") {
            throw Error(`Can only convert foreign function results into base types, not arrays or optionals.}`)
        }
        const dot = dots[0]
        const m = dot.differentiate()
        if (m.kind === "FieldAccess") {
            throw Error(`Accessing a field on a foreign function doesn't make sense`)
        }
        const ret: OpContainer[] = []
        m.children.Assignable.forEach(a => {
            ret.push(...assignableToOps(a, {kind: "any"}, tools))
            ret.push({op: tools.factory.pushPreviousOnCallStack})
        })

        ret.push(
            {op: tools.factory.invokeInstalled(module, m.name)},
            {op: tools.factory.deserializeRpcBufTo(targetType)}
        )
                
        return ret
    },

    HierarchicalStore: (store, dots, targetType, {varmap, factory, inScope}) => {
        if (targetType.kind === "Primitive") {
            throw Error("Stores contain structured data, not primitives")
        }
        if(dots.length > 1) {
            throw Error(`Invoking methods which don't exist on store method results`)
        } else if (dots.length === 1) {
            const m = dots[0].differentiate()
            const out_ops: OpContainer[] = []
            switch(m.kind) {
                case "FieldAccess":
                    throw Error(`Attempting to access a field on a global array of data does not make sense`)
                case "MethodInvocation":
                    if(m.name !== "append") {
                        throw Error(`Method ${m.name} doesn't exist on global arrays`)
                    }
                    // TODO: Eventually optimize this to do a single insertion of all arguments.
                    m.children.Assignable.forEach(asn => {
                        out_ops.push(
                            ...assignableToOps(asn, {kind: "CustomType", type: store.typeName, modification: "none"}, {varmap, factory, inScope}),
                            {op: factory.storeInsertPrevious(store)}
                        )
                    })
                    return out_ops    
                default: Utilities.assertNever(m)
            }
        } else {
            if (targetType.kind !== "any") {
                if (store.typeName !== targetType.type || targetType.modification  !== "array") {
                    throw Error(`The store contains a different type than the one desired`)
                }
            }
            
            return [{op: factory.storeQuery(store)}]
        }
    }
}

function variableReferenceToOps(assign: Parse.VariableReference, targetType: TargetType, {varmap, factory, inScope}: CompilationTools): OpContainer[] {
    const ref = varmap.tryGet(assign.val)
    if (ref !== undefined) {
        const ret: OpContainer[] = [{op: factory.echoVariable(ref.id)}]

        let currentType: CompiledTypes.ResolvedType = ref.type

        if (assign.children.DotStatement.length > 0) {
            
            assign.children.DotStatement.forEach((dot, index) => {
                const method = dot.differentiate()
                switch(method.kind) {
                    case "FieldAccess":
                        if (currentType.kind === "Primitive") {
                            throw Error(`Attempting to access field on a primitive type`)
                        }
                        const fullType = inScope.getEntityOfType(currentType.type, "Struct")
                        const childField = fullType.children.Field.find(c => c.name === method.name)
                        if (!childField) {
                            throw Error(`Attempting to access ${method.name} but it doesn't exist on type`)
                        }
                        ret.push({op: factory.structFieldAccess(fullType, method.name)})
                        currentType = childField.part.FieldType.differentiate()
                        break

                    case "MethodInvocation":
                        throw Error(`No methods are currently supported on local variables`)
                        
                        
                    default: Utilities.assertNever(method)
                }
                
            })
        }
        

        if (targetType.kind !== "any" && !typesAreEqual(targetType, currentType)) {
            throw Error(`Types are not equal`)
        }
        return ret
    } else {
        // Must be global then
        const ent  = inScope.getEntityOfType(assign.val, "HierarchicalStore", "python3")
        //@ts-ignore - typescript doesn't recognize that ent.kind ensures we grab the right handler.
        return globalReferenceToOpsConverter[ent.kind](ent, assign.children.DotStatement, targetType, {varmap, factory, inScope})
    }
}

function assignableToOps(a: Parse.Assignable, targetType: TargetType, tools: CompilationTools): OpContainer[] {
    const assign = a.differentiate()
    switch (assign.kind) {
        case "VariableReference":
            return variableReferenceToOps(assign, targetType, tools)
            
        default: Utilities.assertNever(assign.kind)
    }
    
}


function convertFunction(f: CompiledTypes.Function, factory: CompleteOpFactory, inScope: CompiledTypes.ScopeMap): WritableFunction {
    const body: OpContainer[] = []
    const varmap = new VarMap()
    const parameter = f.parameter.differentiate()
    if (parameter.kind === "UnaryParameter") {
        varmap.add(parameter.name, parameter.type)
    }

    for (let j = 0; j < f.body.statements.length; j++) {
        const stmt = f.body.statements[j].differentiate()
        switch(stmt.kind) {
            case "VariableReference":
                body.push(...variableReferenceToOps(stmt, {kind: "any"}, {factory, inScope, varmap}))
                break

            
            case "VariableCreation":
                const t = stmt.part.CustomType
                const prim = isPrimitive(t)
                body.push(
                    ...assignableToOps(
                        stmt.part.Assignable, 
                        prim !== undefined ? prim : t, 
                        {varmap, factory, inScope})
                )
                
                varmap.add(stmt.name, stmt.part.CustomType)
                body.push(
                    {op: factory.savePrevious}
                )
                break
            case "ReturnStatement":
                const e = stmt.part.Returnable.differentiate()
                switch (e.kind) {
                    case "Nothing":
                        if (f.returnType.kind !== "VoidReturnType") {
                            throw Error(`Returning nothing when you need to return a real type`)
                        }
                        break
                    case "Assignable":
                        
                        if (f.returnType.kind === "VoidReturnType") {
                            throw Error(`Returning something when you need to return nothing`)
                        }
                        body.push(
                            ...assignableToOps(e, f.returnType, {varmap, factory, inScope}),
                            {op: factory.returnPrevious}
                        )
                        
                        break
                    default: Utilities.assertNever(e)
                }
                                
                
                break
            case "ForIn":
                break
            default: Utilities.assertNever(stmt)
        }
    }
    if (f.returnType.kind !== "VoidReturnType" && (body.length === 0 || body.find(b =>[factory.returnPrevious.kind, factory.returnVariable(0).kind].includes(b.op.kind as any)) === undefined)) {
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