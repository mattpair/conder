import { StrongServerEnv, RequiredEnv, Var, AnyOpInstance, getOpWriter, CompleteOpWriter } from 'conduit_kernel';
import { Utilities, CompiledTypes, Parse, Lexicon, AnySchemaInstance } from "conduit_parser";

export function compile(manifest: CompiledTypes.Manifest): Pick<StrongServerEnv, RequiredEnv> {
    const PROCEDURES: StrongServerEnv[Var.PROCEDURES] = {}
    const SCHEMAS: StrongServerEnv[Var.SCHEMAS] = []
    const STORES: StrongServerEnv[Var.STORES] = {}

    const structToSchemaNum: Record<string, number> = {}
    manifest.inScope.forEach(val => {
        if (val.kind === "Struct") {
            SCHEMAS.push(val.schema)
            structToSchemaNum[val.name] = SCHEMAS.length - 1
        }
        if (val.kind === "Function") {
            if (val.parameter.kind === "WithParam") {
                SCHEMAS.push(val.parameter.schema)
                structToSchemaNum[`__func__${val.name}`] = SCHEMAS.length - 1
            }
        }


        if (val.kind === "HierarchicalStore") {
            STORES[val.name] = val.schema
        }
    })
    const opWriter = getOpWriter()

    manifest.inScope.forEach(val => {
        if (val.kind === "Function") {
            PROCEDURES[val.name] = toByteCode(val, structToSchemaNum, manifest, opWriter)
        }
    })

    return {
        PROCEDURES,
        SCHEMAS,
        STORES
    }
}

function toByteCode(f: CompiledTypes.Function, schemaLookup: Record<string, number>, manifest: CompiledTypes.Manifest, opWriter: CompleteOpWriter): AnyOpInstance[] {
    const ops: AnyOpInstance[] = []
    const varmap = new VarMap()
    if (f.parameter.kind === "WithParam") {
        ops.push(opWriter.enforceSchemaOnHeap({heap_pos: 0, schema: schemaLookup[`__func__${f.name}`]}))
        varmap.add(f.parameter.name, f.parameter.schema)
    }
    const targetType: TargetType = f.returnType.kind === "VoidReturnType" ?  {kind: "none"} : f.returnType
    
    const summary = statementsToOps(f.body, targetType, {ops, varmap, manifest, opWriter}, {numberOfPrecedingOps: 0})
    if (!summary.alwaysReturns && targetType.kind !== "none") {
        throw Error(`Function fails to return a value for all paths`)
    }

    return ops
}


class HeapEntry {
    readonly id: number
    readonly type: AnySchemaInstance

    constructor(id: number, type: AnySchemaInstance) {
        this.id = id 
        this.type = type
    }
}

class VarMap extends Map<string, HeapEntry> {
    private count = 0
    private keysInLevel: string[]= []
    maximumVars = 0

    public add(s: string, t: AnySchemaInstance): number {
        super.set(s, new HeapEntry(this.count, t));
        const v = this.count++
        this.keysInLevel.push(s)
        this.maximumVars = Math.max(this.maximumVars, v)
        return v
    }
    
    public get(s: string): HeapEntry {
        const ret = super.get(s)
        if (ret === undefined) {
            throw Error(`Failure looking up variable ${s}`)
        }
        return ret
    }

    public tryGet(s: string): HeapEntry | undefined {
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

function typesAreEqual(l: AnySchemaInstance, r: AnySchemaInstance): boolean {
    if (l.kind !== r.kind) {
        return false
    }
    switch(l.kind) {
        case "Array":
        case "Optional":
            return typesAreEqual(l.data[0], r.data[0])
    
        case "Object":
            if (Object.keys(l.data).length !== Object.keys(r.data).length) {
                return false
            }
            for (const key in l.data) {
                //@ts-ignore
                if (!(key in r.data) || !typesAreEqual(l.data[key], r.data[key])) {
                    return false
                }
            }
            
            return true
        

        default: {
            if (l.data !== undefined) {
                throw Error(`Unexpected type ${l}`)
            }
            return true
        }
    }
}

type CompilationTools = Readonly<{
    varmap: VarMap,
    opWriter: CompleteOpWriter,
    manifest: CompiledTypes.Manifest,
    ops: AnyOpInstance[]
}>

type TargetType = AnySchemaInstance | {kind: "any"} | {kind: "none"} | {kind: "anonFunc"}
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
                assignableToOps(asn, store.schema, tools)
                tools.ops.push(tools.opWriter.insertFromStack(store.name))
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
        if (target.kind === "any" || typesAreEqual(target, store.schema)) {
            tools.ops.push(tools.opWriter.getAllFromStore(store.name))
        } else {
            throw Error(`Type returned from select statement doesn't match expectations`)
        }
    }
}

const globalReferenceToOpsConverter: GlobalReferenceToOpsConverter = {
    python3: (module, dots, targetType, tools) => {
        throw Error(`Python calls are currently unsupported`)
        if (targetType.kind === "anonFunc") {
            throw Error(`Cannot retrieve an anonymous function from python3`)
        }
        
        if (dots.length !== 1) {
            throw Error(`Invalid reference to the installed python module ${module.name}`)
        }
        if (targetType.kind === "any") {
            throw Error(`Cannot determine what type python3 call should be.`)
        }
        // if (targetType.kind === "DetailedType" && targetType.modification !== Lexicon.Symbol.none) {
        //     throw Error(`Can only convert foreign function results into base types, not arrays or optionals.`)
        // }
        if (targetType.kind === "none") {
            throw Error(`Foreign function results must be returned or saved to a variable`)   
        }

        const dot = dots[0]
        const m = dot.differentiate()
        if (m.kind === "FieldAccess") {
            throw Error(`Accessing a field on a foreign function doesn't make sense`)
        }
        // m.children.Assignable.forEach(a => {
        //     assignableToOps(a, {kind: "any"}, tools)
        //     tools.ops.push(tools.factory.pushPreviousOnCallStack)
        // })

        // tools.ops.push(
        //     tools.factory.invokeInstalled(module, m.name),
        // )
   
        // tools.ops.push(tools.factory.deserializeRpcBufTo(targetType))
    },

    HierarchicalStore: (store, dots, targetType, tools) => {
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
                    
                    method(store, m, targetType, tools)
                    return   
                default: Utilities.assertNever(m)
            }
        } else {
            if (targetType.kind === "none") {
                throw Error(`Global reference return real data, not none`)
            }
            if (targetType.kind !== "any") {

                
                if (!typesAreEqual(targetType, store.schema)) {
                    throw Error(`The store contains a different type than the one desired`)
                }
            }
            
            return tools.ops.push(tools.opWriter.getAllFromStore(store.name))
        }
    }
}

function variableReferenceToOps(assign: Parse.VariableReference, targetType: TargetType, tools: CompilationTools): void {
    if (targetType.kind === "anonFunc") {
        throw Error(`Variable references cannot produce anon functions`)
    }
    const ref = tools.varmap.tryGet(assign.val)
    if (ref !== undefined) {
        // It is actually possible for a variable reference to return none, if the method returns none,
        // but for now we will assume it's impossible.
        if (targetType.kind === "none") {
            throw Error(`Returning a variable doesn't make sense when the expected result is none`)
        }
        tools.ops.push(tools.opWriter.copyFromHeap(ref.id))

        let currentType: AnySchemaInstance = ref.type

        if (assign.children.DotStatement.length > 0) {
            
            assign.children.DotStatement.forEach((dot, index) => {
                const method = dot.differentiate()
                switch(method.kind) {
                    case "FieldAccess":
                        if (currentType.kind !== "Object") {
                            throw Error(`Attempting to access field on a ${currentType.kind}`)
                        }

                        if (!(method.name in currentType.data)) {
                            throw Error(`Attempting to access ${method.name} but it doesn't exist on type`)
                        }
                        tools.ops.push(tools.opWriter.fieldAccess(method.name))
                        currentType = currentType.data[method.name]
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
        const ent  = tools.manifest.inScope.getEntityOfType(assign.val, "HierarchicalStore", "python3")
        
        return globalReferenceToOpsConverter[ent.kind](
            //@ts-ignore - typescript doesn't recognize that ent.kind ensures we grab the right handler.
            ent, 
            assign.children.DotStatement, 
            targetType, 
            tools)
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
}>
type ManyStatementConversionInfo = Readonly<{
    numberOfPrecedingOps: number
}>

function statementsToOps(a: CompiledTypes.Statement[], targetType: TargetType, tools: CompilationTools, info: ManyStatementConversionInfo): StatementSummary {
    let alwaysReturns = false
    for (let j = 0; j < a.length; j++) {
        
        const stmt = a[j].differentiate()
        if (alwaysReturns) {
            throw Error(`Unreachable code after: ${stmt.loc}`)
        }
        switch(stmt.kind) {
            case "VariableReference":
                variableReferenceToOps(stmt, {kind: "any"}, tools)
                break

            
            case "VariableCreation":
                const type = tools.manifest.schemaFactory(stmt.part.CompleteType)
                assignableToOps(
                    stmt.part.Assignable, 
                    type, 
                    tools)
                
                
                tools.varmap.add(stmt.name, type)
                tools.ops.push(tools.opWriter.moveStackTopToHeap)
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
                        assignableToOps(e, targetType, tools)
                        tools.ops.push(tools.opWriter.returnStackTop)
                        break

                    default: Utilities.assertNever(e)
                }
                break
            
            case "If":
                assignableToOps(stmt.part.Assignable, {kind: Lexicon.Symbol.bool, data: undefined}, tools)
                // Negate the previous value to jump ahead
                tools.ops.push(tools.opWriter.negatePrev)
                tools.varmap.startLevel()
                const totalNumberOfPreceding = info.numberOfPrecedingOps + tools.ops.length
                // +1 because ths conditional go to takes a spot.
                const childOps: AnyOpInstance[] = []
                const ifSum = statementsToOps(stmt.part.Statements.children.Statement, targetType, {...tools, ops: childOps}, {numberOfPrecedingOps:  totalNumberOfPreceding + 1}) 
                const numNewVars = tools.varmap.endLevel()
                // The conditional should jump beyond the end of the if's inner statement
                tools.ops.push(tools.opWriter.conditionalGoto(totalNumberOfPreceding + childOps.length + 1))
                tools.ops.push(...childOps)
                if (numNewVars > 0) {
                    tools.ops.push(tools.opWriter.truncateHeap(numNewVars))
                } else {
                    // Push a noop so we don't go beyond the end of operation list.
                    tools.ops.push(tools.opWriter.noop)
                }
            
                break

            case "ForIn":
                throw Error(`Currently don't support ${stmt.kind}`)
            
            default: Utilities.assertNever(stmt)
        }
    }

    return {alwaysReturns}
}