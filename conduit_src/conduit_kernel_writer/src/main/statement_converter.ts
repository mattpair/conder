import { CompleteOpFactory, OpInstance } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes, Parse, Lexicon, isPrimitive } from "conduit_parser";
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
    private keysInLevel: string[]= []
    maximumVars = 0

    public add(s: string, t: CompiledTypes.ResolvedType): number {
        super.set(s, new VarMapEntry(this.count, t));
        const v = this.count++
        this.keysInLevel.push(s)
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

    public startLevel(): void {
        this.keysInLevel = []
    }

    public endLevel(): number {
        this.keysInLevel.forEach(k => this.delete(k))
        const ret = this.keysInLevel.length
        this.keysInLevel = []
        return ret
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
    inScope: CompiledTypes.ScopeMap,
    ops: OpInstance[]
}>

type TargetType = CompiledTypes.ResolvedType | {kind: "any"} | {kind: "none"} | {kind: "anonFunc"}
type AllowGlobalReference = Exclude<CompiledTypes.Entity, {kind: "Enum" | "Struct" | "Function"}>

type GlobalReferenceToOps<K extends AllowGlobalReference["kind"]> = (
    global: Extract<AllowGlobalReference, {kind: K}>, 
    dots: Parse.DotStatement[],
    targetType: TargetType, 
    tools: CompilationTools) => void
type GlobalReferenceToOpsConverter = {
    [K in AllowGlobalReference["kind"]]: GlobalReferenceToOps<K>
}

const globalReferenceToOpsConverter: GlobalReferenceToOpsConverter = {
    python3: (module, dots, targetType, tools) => {
        if (targetType.kind === "anonFunc") {
            throw Error(`Cannot retrieve an anonymous function from python3`)
        }
        
        if (dots.length !== 1) {
            throw Error(`Invalid reference to the installed python module ${module.name}`)
        }
        if (targetType.kind === "any") {
            throw Error(`Cannot determine what type python3 call should be.`)
        }
        if (targetType.kind !== "none" && targetType.modification !== "none") {
            throw Error(`Can only convert foreign function results into base types, not arrays or optionals.`)
        }

        const dot = dots[0]
        const m = dot.differentiate()
        if (m.kind === "FieldAccess") {
            throw Error(`Accessing a field on a foreign function doesn't make sense`)
        }
        m.children.Assignable.forEach(a => {
            assignableToOps(a, {kind: "any"}, tools)
            tools.ops.push(tools.factory.pushPreviousOnCallStack)
        })

        tools.ops.push(
            tools.factory.invokeInstalled(module, m.name),
        )
        // TODO: we should still check that the rpc returns successfully
        if (targetType.kind !== "none") {
            tools.ops.push(tools.factory.deserializeRpcBufTo(targetType))
        }
    },

    HierarchicalStore: (store, dots, targetType, {varmap, factory, inScope, ops}) => {
        if (targetType.kind === "Primitive") {
            throw Error("Stores contain structured data, not primitives")
        }
        if (targetType.kind === "anonFunc") {
            throw Error(`Cannot convert a store into an anonymous function`)
        }
        if (targetType.kind === "none") {
            throw Error(`Stores return real data, not none`)
        }
        if(dots.length > 1) {
            throw Error(`Invoking methods which don't exist on store method results`)
        } else if (dots.length === 1) {
            const m = dots[0].differentiate()
            switch(m.kind) {
                case "FieldAccess":
                    throw Error(`Attempting to access a field on a global array of data does not make sense`)
                case "MethodInvocation":
                    if(m.name !== "append") {
                        throw Error(`Method ${m.name} doesn't exist on global arrays`)
                    }
                    // TODO: Eventually optimize this to do a single insertion of all arguments.
                    m.children.Assignable.forEach(asn => {
                        assignableToOps(asn, {kind: "CustomType", type: store.typeName, modification: "none"}, {varmap, factory, inScope, ops})
                        ops.push(factory.storeInsertPrevious(store))
                    })
                    return   
                default: Utilities.assertNever(m)
            }
        } else {
            if (targetType.kind !== "any") {
                if (store.typeName !== targetType.type || targetType.modification  !== "array") {
                    throw Error(`The store contains a different type than the one desired`)
                }
            }
            
            return ops.push(factory.storeQuery(store))
        }
    }
}

function variableReferenceToOps(assign: Parse.VariableReference, targetType: TargetType, {varmap, factory, inScope, ops}: CompilationTools): void {
    if (targetType.kind === "anonFunc") {
        throw Error(`Variable references cannot produce anon functions`)
    }
    const ref = varmap.tryGet(assign.val)
    if (ref !== undefined) {
        // It is actually possible for a variable reference to return none, if the method returns none,
        // but for now we will assume it's impossible.
        if (targetType.kind === "none") {
            throw Error(`Returning a variable doesn't make sense when the expected result is none`)
        }
        ops.push(factory.echoVariable(ref.id))

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
                        ops.push(factory.structFieldAccess(fullType, method.name))
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
        return
    } else {
        // Must be global then
        const ent  = inScope.getEntityOfType(assign.val, "HierarchicalStore", "python3")
        
        return globalReferenceToOpsConverter[ent.kind](
            //@ts-ignore - typescript doesn't recognize that ent.kind ensures we grab the right handler.
            ent, 
            assign.children.DotStatement, 
            targetType, 
            {varmap, factory, inScope, ops})
    }
}

function assignableToOps(a: Parse.Assignable, targetType: TargetType, tools: CompilationTools): void {
    const assign = a.differentiate()
    switch (assign.kind) {
        case "VariableReference":
            return variableReferenceToOps(assign, targetType, tools)

        case "AnonFunction":
            throw Error(`Anonmous functions cannot be compiled yet`)
            
        default: Utilities.assertNever(assign)
    }
    
}

type StatementSummary = Readonly<{
    alwaysReturns: boolean
    ops: OpInstance[],
}>
type ManyStatementConversionInfo = Readonly<{
    numberOfPrecedingOps: number
}>

function statementsToOps(a: CompiledTypes.Statement[], targetType: TargetType, tools: Omit<CompilationTools, "ops">, info: ManyStatementConversionInfo): StatementSummary {
    let alwaysReturns = false
    const ops: OpInstance[] = []
    for (let j = 0; j < a.length; j++) {
        
        const stmt = a[j].differentiate()
        if (alwaysReturns) {
            throw Error(`Unreachable code after: ${stmt.loc}`)
        }
        switch(stmt.kind) {
            case "VariableReference":
                variableReferenceToOps(stmt, {kind: "any"}, {...tools, ops})
                break

            
            case "VariableCreation":
                const t = stmt.part.CustomType
                const prim = isPrimitive(t)
                
                assignableToOps(
                    stmt.part.Assignable, 
                    prim !== undefined ? prim : t, 
                    {...tools, ops})
                
                
                tools.varmap.add(stmt.name, stmt.part.CustomType)
                ops.push(tools.factory.savePrevious)
                break
            case "ReturnStatement":
                const e = stmt.part.Returnable.differentiate()
                alwaysReturns = true
                switch (e.kind) {
                    case "Nothing":
                        if (targetType.kind !== "none") {
                            throw Error(`Returning something when you need to return a real type`)
                        }
                        break
                    case "Assignable":
                        assignableToOps(e, targetType, {...tools, ops})
                        ops.push(tools.factory.returnPrevious)
                        break

                    default: Utilities.assertNever(e)
                }
                break
            
            case "If":
                assignableToOps(stmt.part.Assignable, {kind: "Primitive", val: Lexicon.Symbol.bool, modification: "none"}, {...tools, ops})
                // Negate the previous value to jump ahead
                ops.push(tools.factory.negatePrev)
                tools.varmap.startLevel()
                const totalNumberOfPreceding = info.numberOfPrecedingOps + ops.length
                // +1 because ths conditional go to takes a spot.
                const ifSum = statementsToOps(stmt.part.Statements.children.Statement, targetType, tools, {numberOfPrecedingOps:  totalNumberOfPreceding + 1}) 
                const numNewVars = tools.varmap.endLevel()
                // The conditional should jump beyond the end of the if's inner statement
                ops.push(tools.factory.conditionalGoto(totalNumberOfPreceding + ifSum.ops.length + 1))
                ops.push(...ifSum.ops)
                if (numNewVars > 0) {
                    ops.push(tools.factory.dropVariables(numNewVars))
                } else {
                    // Push a noop so we don't go beyond the end of operation list.
                    ops.push(tools.factory.noop)
                }
            
                break

            case "ForIn":
                throw Error(`Currently don't support ${stmt.kind}`)
            
            default: Utilities.assertNever(stmt)
        }
    }

    return {alwaysReturns, ops}
}

function convertFunction(f: CompiledTypes.Function, factory: CompleteOpFactory, inScope: CompiledTypes.ScopeMap): WritableFunction {
    const varmap = new VarMap()
    const parameter = f.parameter.differentiate()
    if (parameter.kind === "UnaryParameter") {
        varmap.add(parameter.name, parameter.type)
    }
    const targetType: TargetType = f.returnType.kind === "VoidReturnType" ?  {kind: "none"} : f.returnType
    
    const summary = statementsToOps(f.body.statements, targetType, {varmap, inScope, factory}, {numberOfPrecedingOps: 0})
    if (!summary.alwaysReturns && targetType.kind !== "none") {
        throw Error(`Function fails to return a value for all paths`)
    }

    return {
        name: f.name,
        method: f.method,
        body: summary.ops,
        parameter: f.parameter,
        maximumNumberOfVariables: varmap.maximumVars
    }
}