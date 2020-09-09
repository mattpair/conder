import { CompleteOpFactory, OpInstance } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes, Parse, Lexicon } from "conduit_parser";

export type WritableFunction = Readonly<{
    name: string
    method: "POST" | "GET"
    body: OpInstance[],
    parameter: Parse.Parameter
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
    readonly type: CompiledTypes.Type
}

class VarMapEntry implements VarMapEntryI{
    readonly id: number
    readonly type: CompiledTypes.Type

    constructor(id: number, type: CompiledTypes.Type) {
        this.id = id 
        this.type = type
    }
}

class VarMap extends Map<string, VarMapEntryI> {
    private count = 0
    private keysInLevel: string[]= []
    maximumVars = 0

    public add(s: string, t: CompiledTypes.Type): number {
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

function typesAreEqual(l: CompiledTypes.Type, r: CompiledTypes.Type): boolean {
    if (l.kind !== r.kind) {
        return false
    }
    switch(l.kind) {
        case "TypeName":
            //@ts-ignore
            return l.name === r.name
        case "DetailedType":
            //@ts-ignore
            return l.modification === r.modification && typesAreEqual(l.part.CompleteType.differentiate(), r.part.CompleteType.differentiate())
        case "Primitive":
            //@ts-ignore
            return l.type === r.type
        default: Utilities.assertNever(l)
    }
}

type CompilationTools = Readonly<{
    varmap: VarMap,
    factory: CompleteOpFactory,
    inScope: CompiledTypes.ScopeMap,
    ops: OpInstance[]
}>

type TargetType = CompiledTypes.Type | {kind: "any"} | {kind: "none"} | {kind: "anonFunc"}
type HierStoreMethodCompiler = (
    store: CompiledTypes.HierarchicalStore, 
    invocation: Parse.MethodInvocation,
    targetType: Exclude<TargetType, {kind: "anonFunc" }>, 
    
    tools: CompilationTools) => void
type HierStoreMethods = Record<"append" | "select", HierStoreMethodCompiler>

type AllowGlobalReference = Exclude<CompiledTypes.Entity, {kind: "Enum" | "Struct" | "Function"}>

type GlobalReferenceToOps<K extends AllowGlobalReference["kind"]> = (
    global: Extract<AllowGlobalReference, {kind: K}>, 
    stmt: Parse.DotStatement[],
    targetType: TargetType, 
    tools: CompilationTools) => void
type GlobalReferenceToOpsConverter = {
    [K in AllowGlobalReference["kind"]]: GlobalReferenceToOps<K>
}

const hierStoreMethodToOps: HierStoreMethods = {
    append: (store, invoc, target, tools) => {
        if (target.kind === "any" || target.kind === "none") {
            // TODO: Eventually optimize this to do a single insertion of all arguments.
            invoc.children.Assignable.forEach(asn => {
                assignableToOps(asn, {kind: "TypeName", name: store.typeName}, tools)
                tools.ops.push(tools.factory.storeInsertPrevious(store))
            })    
        } else {
            throw Error(`Appending to a store does not return any data`)
        }
    },
    select: (store, invoc, target, tools) => {
        if (invoc.children.Assignable.length > 1) {
            throw Error(`Select may only be called with one argument`)
        }
        if (target.kind === "none") {
            throw Error(`Select must yield some result`)
        }
        const a = invoc.children.Assignable[0].differentiate()
        if (a.kind !== "AnonFunction") {
            throw Error(`Select must be invoked with an anonymous function`)
        }
        const ss = a.part.Statements.children.Statement
        if (ss.length > 1) {
            throw Error(`Select functions currently only support one statement`)
        }

        const s = ss[0].differentiate()
        if (s.kind !== "ReturnStatement") {
            throw Error(`It only makes sense to select from a store if you are going to return results`)
        }
        const r = s.part.Returnable.differentiate()
        if (r.kind !== "Assignable") {
            throw Error(`It only makes sense to select from a store if you are going to return results`)
        }
        const assignable = r.differentiate()
        if (assignable.kind === "AnonFunction") {
            throw Error(`It does not make sense to return an anonymous function from a select statement`)
        }

        if (assignable.children.DotStatement.length > 0 || assignable.val !== a.rowVarName) {
            throw Error(`Currently only support returning the entire row variable in select statements`)
        }
        if (target.kind === "any" || typesAreEqual(target, 
            {kind: "DetailedType", modification: Lexicon.Symbol.Array, 
                part: {CompleteType: {kind: "CompleteType", differentiate: () => ({kind: "TypeName", name: store.typeName})}}})) {
            tools.ops.push(tools.factory.storeQuery(store))
        } else {
            throw Error(`Type returned from select statement doesn't match expectations`)
        }
    }
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
        if (targetType.kind === "DetailedType" && targetType.modification !== Lexicon.Symbol.none) {
            throw Error(`Can only convert foreign function results into base types, not arrays or optionals.`)
        }
        if (targetType.kind === "none") {
            throw Error(`Foreign function results must be returned or saved to a variable`)   
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
   
        tools.ops.push(tools.factory.deserializeRpcBufTo(targetType))
    },

    HierarchicalStore: (store, dots, targetType, {varmap, factory, inScope, ops}) => {
        if (targetType.kind === "Primitive") {
            throw Error("Stores contain structured data, not primitives")
        }
        if (targetType.kind === "anonFunc") {
            throw Error(`Cannot convert a store into an anonymous function`)
        }
        
        if(dots.length > 1) {
            throw Error(`Invoking methods which don't exist on store method results`)
        } else if (dots.length === 1) {
            const m = dots[0].differentiate()
            switch(m.kind) {
                case "FieldAccess":
                    throw Error(`Attempting to access a field on a global array of data does not make sense`)
                case "MethodInvocation":
                    
                    const method: HierStoreMethodCompiler | undefined = 
                        //@ts-ignore 
                        hierStoreMethodToOps[m.name]

                    if (method === undefined) {
                        throw Error(`Method ${m.name} doesn't exist on global arrays`)
                    }
                    
                    method(store, m, targetType, {varmap, factory, inScope, ops})
                    return   
                default: Utilities.assertNever(m)
            }
        } else {
            if (targetType.kind === "none") {
                throw Error(`Global reference return real data, not none`)
            }
            if (targetType.kind !== "any") {

                
                if (!typesAreEqual(targetType, {kind: "DetailedType", modification: Lexicon.Symbol.Array, part: {CompleteType: {kind: "CompleteType", differentiate: () => ({kind: "TypeName", name: store.typeName})}}})) {
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

        let currentType: CompiledTypes.Type = ref.type

        if (assign.children.DotStatement.length > 0) {
            
            assign.children.DotStatement.forEach((dot, index) => {
                const method = dot.differentiate()
                switch(method.kind) {
                    case "FieldAccess":
                        if (currentType.kind === "Primitive") {
                            throw Error(`Attempting to access field on a primitive type`)
                        }
                        if (currentType.kind === "DetailedType") {
                            throw Error(`There does not currently exist any methods on generic types`)
                        }
                        const fullType = inScope.getEntityOfType(currentType.name, "Struct")
                        const childField = fullType.children.Field.find(c => c.name === method.name)
                        if (!childField) {
                            throw Error(`Attempting to access ${method.name} but it doesn't exist on type`)
                        }
                        ops.push(factory.structFieldAccess(fullType, method.name))
                        currentType = childField.part.CompleteType.differentiate()
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
                const t = stmt.part.CompleteType.differentiate()
                
                assignableToOps(
                    stmt.part.Assignable, 
                    t, 
                    {...tools, ops})
                
                
                tools.varmap.add(stmt.name, t)
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
                assignableToOps(stmt.part.Assignable, {kind: "Primitive", type: Lexicon.Symbol.bool}, {...tools, ops})
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
        varmap.add(parameter.name, parameter.part.UnaryParameterType.part.CompleteType.differentiate())
    }
    const targetType: TargetType = f.returnType.kind === "VoidReturnType" ?  {kind: "none"} : f.returnType.differentiate()
    
    const summary = statementsToOps(f.body, targetType, {varmap, inScope, factory}, {numberOfPrecedingOps: 0})
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