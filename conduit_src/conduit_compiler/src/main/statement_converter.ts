import { StrongServerEnv, RequiredEnv, Var, AnyOpInstance, getOpWriter, CompleteOpWriter, interpeterTypeFactory} from 'conduit_kernel';
import { Utilities, CompiledTypes, Parse, Lexicon, AnySchemaInstance, schemaFactory } from "conduit_parser";

export function compile(manifest: CompiledTypes.Manifest): Pick<StrongServerEnv, Exclude<RequiredEnv, Var.DEPLOYMENT_NAME>> {
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
            try {
                PROCEDURES[val.name] = toByteCode(val, structToSchemaNum, manifest, opWriter)
            } catch (e) {
                throw Error(`While compiling function ${val.name}: ${e.message}`)
            }
            
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
    const targetType: AnyType = f.returnType.kind === "VoidReturnType" ?  {kind: "any"} : f.returnType
    
    const summary = statementsToOps(f.body, targetType, {ops, varmap, manifest, opWriter}, {numberOfPrecedingOps: 0})
    if (!summary.alwaysReturns && targetType.kind !== "any") {
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

function typesAreEqual(l: AnyType, r: AnyType): boolean {
    if (l.kind === "any" || r.kind === "any") {
        return true
    }
    if (l.kind !== r.kind) {
        return false
    }
    
    switch(l.kind) {

        case "Ref":
            //@ts-ignore
            return l.data === r.data
        case "Array":
        case "Optional":
            //@ts-ignore
            return typesAreEqual(l.data[0], r.data[0])
    
        case "Object":
            //@ts-ignore
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

enum ArrayMethods {
    append="append",
    select="select",
    len="len",
}

type AnyType = AnySchemaInstance | {kind: "any"} | {kind: "anonFunc"}
type HierStoreMethodCompiler = (
    store: CompiledTypes.HierarchicalStore, 
    invocation: Parse.MethodInvocation,
    targetType: Exclude<AnyType, {kind: "anonFunc" }>, 
    
    tools: CompilationTools) => AnyType
type HierStoreMethods = Record<ArrayMethods, HierStoreMethodCompiler>

type AllowGlobalReference = Exclude<CompiledTypes.Entity, {kind: "Enum" | "Struct" | "Function" | "python3"}>

type GlobalReferenceToOps<K extends AllowGlobalReference["kind"]> = (
    global: Extract<AllowGlobalReference, {kind: K}>, 
    stmt: Parse.DotStatement[],
    targetType: AnyType, 
    tools: CompilationTools) => void
type GlobalReferenceToOpsConverter = {
    [K in AllowGlobalReference["kind"]]: GlobalReferenceToOps<K>
}

const hierStoreMethodToOps: HierStoreMethods = {
    append: (store, invoc, target, tools) => {
        const returnType = schemaFactory.Array(schemaFactory.Ref(store.name))
        if (typesAreEqual(target, returnType)) {
            // TODO: Eventually optimize this to do a single insertion of all arguments.
            invoc.children.Assignable.forEach(asn => {
                assignableToOps(asn, schemaFactory.Array(store.schema), tools)
                tools.ops.push(tools.opWriter.insertFromStack(store.name))
            })
            return returnType
        } else {
            throw Error(`Appending to a store returns an array of refs to the store`)
        }
    },

    len: (store, invoc, target, tools) => {
        if (invoc.children.Assignable.length > 0) {
            throw Error(`len() should be called without any args`)
        }
        tools.ops.push(tools.opWriter.storeLen(store.name))
        return schemaFactory.int
    },

    select: (store, invoc, target, tools) => {
        if (invoc.children.Assignable.length > 1) {
            throw Error(`Select may only be called with one argument`)
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
        switch (assignable.kind) {
            case "AnonFunction":
                throw Error(`It does not make sense to return an anonymous function from a select statement`)
                
            case "ArrayLiteral":
                throw Error(`Returning an array literal from within a select is not supported`)

            case "ObjectLiteral":
                throw Error("Returning an object literal from within a select is not supported")

            case "NumberLiteral":
                throw Error("Returning a number literal does not make sense")

            case "StringLiteral":
                throw Error("Returning a string literal does not make sense")
        }

        if (assignable.children.DotStatement.length  === 1) {
            const method = assignable.children.DotStatement[0].differentiate()
            if (assignable.val !== a.rowVarName || method.kind !== "MethodInvocation") {
                throw Error(`Invalid select statement`)
            }
            if (method.name !== "ref") {
                throw Error(`Unknown method: ${method.name} called on row variable`)
            }
            if (method.children.Assignable.length > 0) {
                throw Error(`ref should not be called with any arguments`)
            }
            const refSchema = schemaFactory.Array(schemaFactory.Ref(store.name))
            
            const projection: Parameters<CompleteOpWriter["queryStore"]>[0][1] = {}
            for (const key in store.schema.data) {
                projection[key] = false
            }
            tools.ops.push(tools.opWriter.queryStore([store.name, projection]))
            return refSchema
        }

        if (assignable.children.DotStatement.length > 0 || assignable.val !== a.rowVarName) {
            throw Error(`Currently only support returning the entire row variable in select statements`)
        }
        tools.ops.push(tools.opWriter.getAllFromStore(store.name))
        return schemaFactory.Array(store.schema)
    }
}

const globalReferenceToOpsConverter: GlobalReferenceToOpsConverter = {

    HierarchicalStore: (store, dots, targetType, tools) => {
        if (targetType.kind === "anonFunc") {
            throw Error(`Cannot convert a store into an anonymous function`)
        }
        
        if(dots.length >= 1) {
            const m = dots[0].differentiate()
            let currentType: AnyType = undefined
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
                    
                    currentType = method(store, m, targetType, tools)
                    break   
                default: Utilities.assertNever(m)
            }
            if (dots.length > 1) {
                dotsToOps(dots.slice(1), targetType, currentType, tools)
            } else if (!typesAreEqual(targetType, currentType)) {
                throw Error(`Global access did not produce the expected type`)
            }
        } else {

            if (targetType.kind !== "Array") {
                throw Error(`Referencing ${store.name} returns an array of data.`)
            }
            
            if (!typesAreEqual(targetType.data[0], store.schema)) {
                throw Error(`${store.name} contains type: ${JSON.stringify(store.schema, null, 2)}\n\nFound: ${JSON.stringify(targetType, null, 2)}`)
            }
            
            
            return tools.ops.push(tools.opWriter.getAllFromStore(store.name))
        }
    }
}

function dotsToOps(dots: Parse.DotStatement[], targetType: AnyType, currentType: AnyType, tools: CompilationTools): void {
    dots.forEach((dot, index) => {
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
                switch (currentType.kind) {
                    case "Ref":
                        const store = tools.manifest.inScope.getEntityOfType(currentType.data, "HierarchicalStore")

                        if (method.name === "delete") {
                            if (method.children.Assignable.length > 0) {
                                throw Error(`Deleting a pointer takes no args`)
                            }
                            currentType = schemaFactory.bool
                            tools.ops.push(tools.opWriter.deleteOneInStore({store: store.name}))
                            break
                        }

                        if (method.name !== "deref") {
                            throw Error(`References only support the deref method`)
                        }
                        if (method.children.Assignable.length > 1) {
                            throw Error("deref takes one optional argument")
                        } else if (method.children.Assignable.length === 1) {
                            const anon = method.children.Assignable[0].differentiate()
                            if (anon.kind !== "AnonFunction") {
                                throw Error(`Expected a AnonFunction but received a ${anon.kind}`)
                            }
                            const derefstmts = anon.part.Statements.children.Statement
                            if (derefstmts.length !== 2) {
                                throw Error(`Expected exactly two statements in deref arg`)
                            }
                            const one = derefstmts[0].differentiate()
                            const two = derefstmts[1].differentiate()
                            
                            
                            if (one.kind !== "VariableReference" || one.val !== anon.rowVarName || one.children.DotStatement.length === 0) {
                                throw Error(`The first statement must do something to the row variable`)
                            }
                            if (two.kind !== "ReturnStatement" ) {
                                throw Error(`You must return the row variable`)
                            } else {
                                const ret = two.part.Returnable.differentiate()
                                if (ret.kind !== "Assignable") {
                                    throw Error(`You must return the row variable`)
                                }
                                const  retass = ret.differentiate()
                                if (retass.kind !== "VariableReference" || retass.children.DotStatement.length !== 0 || retass.val !== anon.rowVarName) {
                                    throw Error(`You must return the row variable`)
                                }
                                const updateDoc: Parameters<CompleteOpWriter["createUpdateDoc"]>[0] = {"$push": {}}
                                tools.ops.push(tools.opWriter.createUpdateDoc(updateDoc))
                                if (one.children.DotStatement.length === 1) {
                                    throw Error(`The only command supported on derefed variables is append`)
                                }
                                let currentSchema: AnySchemaInstance = store.schema as AnySchemaInstance
                                const fieldAccess = one.children.DotStatement.slice(0, one.children.DotStatement.length - 1).map(d => d.differentiate())
                                const fieldNames: string[] = []
                                fieldAccess.forEach(dot => {

                                    switch(dot.kind) {
                                        case "MethodInvocation":
                                            throw Error(`We only support append calls in derefs`)
                                        case "FieldAccess":
                                            if (currentSchema.kind !== "Object") {
                                                throw Error(`Accessing a field on a non-object is not allowed`)
                                            }
                                            if (!(dot.name in currentSchema.data)) {
                                                throw Error(`Field ${dot.name} does not exist on object`)
                                            }
                                            currentSchema = currentSchema.data[dot.name]
                                            
                                            fieldNames.push(dot.name)
                                            break
                                        default: Utilities.assertNever(dot)
                                    }
                                })
                                const lastDot = one.children.DotStatement[one.children.DotStatement.length -1].differentiate()
                                if (lastDot.kind !== "MethodInvocation" || lastDot.name !== "append"){
                                    throw Error(`Currently only support append`)
                                }
                                if (lastDot.children.Assignable.length !== 1) {
                                    throw Error(`Append only takes one arg`)
                                }
                                if (currentSchema.kind !== "Array") {
                                    throw Error(`Append can only be called on arrays`)
                                }
                                assignableToOps(lastDot.children.Assignable[0], currentSchema, tools)

                                tools.ops.push(
                                    tools.opWriter.setNestedField(["$push", fieldNames.join(".")]),
                                    tools.opWriter.updateOne(store.name)
                                )
                            }
                        } else {
                            const projection: Parameters<CompleteOpWriter["findOneInStore"]>[0][1] = {}
                            projection._id = false
                            tools.ops.push(tools.opWriter.findOneInStore([{store: store.name}, projection]))
                        }
                        
                        currentType = schemaFactory.Optional(store.schema)
                        
                        
                        break

                    case "Array":
                        if (method.name !== "len") {
                            throw Error(`Unrecognized method on a local array: ${method.name}`)
                        } 
                        if (method.children.Assignable.length > 0) {
                            throw Error(`len takes no args`)
                        }
                        currentType = schemaFactory.int
                        tools.ops.push(tools.opWriter.arrayLen)
                        break
                        
                    default:
                        throw Error(`${method.name} does not exist on ${currentType.kind}`)
                }
                break
                
            default: Utilities.assertNever(method)
        }
        
    })


    if (!typesAreEqual(targetType, currentType)) {
        throw Error(`Types are not equal. Expected: ${JSON.stringify(targetType, null, 2)}\n\n Received: ${JSON.stringify(currentType, null, 2)}`)
    }
}

function variableReferenceToOps(assign: Parse.VariableReference, targetType: AnyType, tools: CompilationTools): void {
    if (targetType.kind === "anonFunc") {
        throw Error(`Variable references cannot produce anon functions`)
    }
    const ref = tools.varmap.tryGet(assign.val)
    if (ref !== undefined) {

        tools.ops.push(tools.opWriter.copyFromHeap(ref.id))

        dotsToOps(assign.children.DotStatement, targetType,  ref.type, tools)
        return
    } else {
        // Must be global then
        const ent  = tools.manifest.inScope.getEntityOfType(assign.val, "HierarchicalStore")
        
        return globalReferenceToOpsConverter[ent.kind](
            //@ts-ignore - typescript doesn't recognize that ent.kind ensures we grab the right handler.
            ent, 
            assign.children.DotStatement, 
            targetType, 
            tools)
    }
}

function assignableToOps(a: Parse.Assignable, targetType: AnyType, tools: CompilationTools): void {
    const assign = a.differentiate()
    switch (assign.kind) {
        case "VariableReference":
            return variableReferenceToOps(assign, targetType, tools)

        case "StringLiteral":
            tools.ops.push(tools.opWriter.instantiate(interpeterTypeFactory.string(assign.val)))
            break
        case "AnonFunction":
            throw Error(`Unexpected anon function`)
            
        case "ArrayLiteral":
            if (targetType.kind === "Array") {
                tools.ops.push(tools.opWriter.instantiate([]))
                const childTarget = targetType.kind === "Array" ? targetType.data[0] : targetType
                assign.children.Assignable.forEach(child => {
                    assignableToOps(child, childTarget, tools)
                    tools.ops.push(tools.opWriter.arrayPush)
                })
            } else {
                throw Error(`Array literal is not assignable to the desired type.`)
            }
            break
        case "ObjectLiteral":
            if (targetType.kind !== "Object") {
                throw Error(`Object literal is not equivalent to ${targetType.kind}`)
            }
            tools.ops.push(tools.opWriter.instantiate({}))
            if (targetType.kind === "Object" && Object.keys(targetType.data).length !== assign.children.FieldLiteral.length) {
                throw Error(`Object literal is not equivalent to desired type`)
            }
            assign.children.FieldLiteral.forEach(field => {
                if (!(field.name in targetType.data)) {
                    throw Error(`Unexpected field in object literal: ${field.name}`)
                } else {
                    assignableToOps(field.part.Assignable, targetType.data[field.name], tools)
                }
                tools.ops.push(tools.opWriter.assignPreviousToField(field.name))
            })
            break

        case "NumberLiteral":
            
            switch (targetType.kind) {
                case Lexicon.Symbol.double:
                    tools.ops.push(tools.opWriter.instantiate(interpeterTypeFactory.double(assign.val)))
                    break

                case Lexicon.Symbol.int:
                    tools.ops.push(tools.opWriter.instantiate(interpeterTypeFactory.int(assign.val)))
                    break

                default: throw Error(`Number literals are not equivalent to ${targetType.kind}`)
            }
            break

        default: Utilities.assertNever(assign)
    }
    
}

type StatementSummary = Readonly<{
    alwaysReturns: boolean
}>
type ManyStatementConversionInfo = Readonly<{
    numberOfPrecedingOps: number
}>

function statementsToOps(a: CompiledTypes.Statement[], targetType: AnyType, tools: CompilationTools, info: ManyStatementConversionInfo): StatementSummary {
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
                        if (targetType.kind !== "any") {
                            throw Error(`Returning something when you need to return a real type`)
                        }
                        tools.ops.push(tools.opWriter.instantiate(null), tools.opWriter.returnStackTop)
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