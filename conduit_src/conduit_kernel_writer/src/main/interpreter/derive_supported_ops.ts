import { CompiledTypes, Utilities, Lexicon} from 'conduit_parser';
import {generateRustGetAllQuerySpec} from '../sql'
import { toAnyType } from '../toAnyType';
import { TypeWriter } from '../type_writing/type_writer';
import {ForeignInstallResults} from 'conduit_foreign_install'
import { Primitives } from 'conduit_parser/dist/src/main/lexicon';

type OpDef<K="static"> = {
    readonly kind: K
    readonly rustEnumMember: string
    readonly rustOpHandler: string
}
type OpDefWithParameter = OpDef<"param"> & {readonly paramType: string}
export type AnyOpDef = OpDef | OpDefWithParameter

type StaticOp<KIND> = Op<KIND, "static">

type ParamLifetime = "runtime" | "compile"
type ParamOp<KIND, P, LT extends ParamLifetime> = {kind: KIND, class: "param", paramType: P, param_lifetime: LT}

type OpClass = "static" | "store" | "param" | "struct" | "python3" | "rpc"
type Op<KIND, C extends OpClass, P=undefined, P_LIFETIME extends ParamLifetime ="runtime"> = 
{kind: KIND, class: C, paramType?: P, param_lifetime: P_LIFETIME}

type Ops = 
ParamOp<"returnVariable", number, "runtime"> |
StaticOp<"returnPrevious"> |
StaticOp<"savePrevious"> |
StaticOp<"pushPreviousOnCallStack"> |
ParamOp<"echoVariable", number, "runtime"> |
Op<"deserializeRpcBufTo", "rpc"> |
Op<"storeInsertPrevious", "store"> |
Op<"storeQuery", "store"> |
Op<"structFieldAccess", "struct", string> |
Op<"invokeInstalled", "python3", string, "compile">

type StaticFactory<S> = OpInstance<S>

type ParamFactory<P, S> = (p: P) => OpInstance<S>

type OpFactory<PARAM, REQUIRED_PARAM> = PARAM extends undefined ? (s: REQUIRED_PARAM) => OpInstance  : (s: REQUIRED_PARAM, p: PARAM) => OpInstance

type OpFactoryFinder<C extends Ops> = C["class"] extends "static" ? StaticFactory<C["kind"]> : 
C["class"] extends "param" ? ParamFactory<C["paramType"], C["kind"]> :
C["class"] extends "store"  ? OpFactory<C["paramType"], CompiledTypes.HierarchicalStore> : 
C["class"] extends "struct" ? OpFactory<C["paramType"], CompiledTypes.Struct> : 
C["class"] extends "python3" ? OpFactory<C["paramType"], CompiledTypes.Python3Install> : 
C["class"] extends "rpc" ? OpFactory<C["paramType"], CompiledTypes.ResolvedType> : never

export type CompleteOpFactory = {
    readonly [P in Ops["kind"]]: OpFactoryFinder<Extract<Ops, {kind: P}>>
};

type ChooseOpDef<O extends Ops> = O["paramType"] extends undefined ? 
OpDef[] : 
O["param_lifetime"] extends "compile" ? OpDef[]: OpDefWithParameter[]

type UniqueOpDef<O extends Ops, E extends {kind: string}, KIND_OVERRIDE=undefined> = Readonly<{kind: KIND_OVERRIDE extends undefined ? E["kind"] : KIND_OVERRIDE, create: (t: E) => ChooseOpDef<O>}>
type OpDefFinder<C extends Ops> = C["class"] extends "static" ? OpDef: 
C["class"] extends "param" ? OpDefWithParameter :
C["class"] extends "store" ? UniqueOpDef<C, CompiledTypes.HierarchicalStore> : 
C["class"] extends "struct" ? UniqueOpDef<C, CompiledTypes.Struct> : 
C["class"] extends "python3" ? UniqueOpDef<C, CompiledTypes.Python3Install> : 
C["class"] extends "rpc" ? UniqueOpDef<C, CompiledTypes.ResolvedType, "rpc"> : never



export type CompleteOpSpec = {
    readonly [P in Ops["kind"]]: {
        factoryMethod: OpFactoryFinder<Extract<Ops, {kind: P}>>,
        opDefinition: OpDefFinder<Extract<Ops, {kind: P}>>
    }
}

export type OpInstance<S=string> = Readonly<{
    // These fields are based on the Interpreter writer's op field.
    kind: S
    data: any
}>

export type AllTypesMember = Readonly<{
    name: string, type?: string, http_returner: string
}>


type AnyTypeDefOption = {
    exemptFromUsingReferences?: boolean
}

class DataContainingType implements AllTypesMember {
    readonly name: string
    readonly type: string
    
    constructor(name: string, type: string, options: AnyTypeDefOption = {}) {
        this.name = name
        // All types are references unless otherwise specified.
        // This reduces the number of clones that must be performed.
        this.type = `${options.exemptFromUsingReferences ? "" : "&'exec"} ${type}`
    }
    public static allPossibleDataContainingTypes(baseName: string, baseType: string): DataContainingType[] {
        return [
            new DataContainingType(baseName, baseType),
            new DataContainingType(`${baseName}Instance`, baseType, {exemptFromUsingReferences: true}),
            new DataContainingType(`Many${baseName}`,`Vec<${baseType}>`),
            new DataContainingType(`Optional${baseName}`, `Option<${baseType}>`)
        ]
    }
    
    public get http_returner() : string {
        return `AnyType::${this.name}(data) => HttpResponse::Ok().json(data)`
    }
    
}

export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest} & ForeignInstallResults, 
{supportedOps: AnyOpDef[], opFactory: CompleteOpFactory, allTypesUnion: AllTypesMember[], additionalRustStructsAndEnums: string[]}> = {
    stepName: "deriving supported operations",
    func: ({manifest, foreignLookup}) => {
        const allTypesUnion: AllTypesMember[] = [
            {name: "None", http_returner: `AnyType::None => HttpResponse::Ok().finish()`},
            {name: "Err", type: "String", http_returner: `AnyType::Err(e) => {
                println!("Error: {}", e);
                HttpResponse::BadRequest().finish()
            }`}
        ]

        Lexicon.Primitives.forEach(p => {
            const r = TypeWriter.rust.primitive[p]
            allTypesUnion.push(...DataContainingType.allPossibleDataContainingTypes(p, r))
        })
        function raiseErrorWithMessage(s: string): string {
            return `AnyType::Err("${s}".to_string())`
        }
        function raiseErrorWithVariableMessage(v: string): string {
            return `AnyType::Err(${v}.to_string())`
        }
        const additionalRustStructsAndEnums: string[] = []
        manifest.inScope.forEach(v => {
            
        
            switch (v.kind) {
                case "Struct":
                    allTypesUnion.push(...DataContainingType.allPossibleDataContainingTypes(v.name, v.name))
                    if (!v.isConduitGenerated) {
                        additionalRustStructsAndEnums.push(`
                        #[derive(Serialize, Deserialize, Clone)]
                        enum ${v.name}Field {
                            ${v.children.Field.map(f => `${v.name}${f.name}FieldRef`).join(",\n")}
                        }
                        `)      
                    }
                       
                    break
                case "HierarchicalStore":

                    allTypesUnion.push(
                        new DataContainingType(`${v.name}Result`, `Vec<${v.typeName}>`, {exemptFromUsingReferences: true})
                    )
            }        
        })
        

        const OpSpec: CompleteOpSpec = {
            pushPreviousOnCallStack: {
                opDefinition: {
                    kind: "static",
                    rustOpHandler: `callstack.push(prev); AnyType::None`,
                    rustEnumMember: `pushPreviousOnCallStack`
                },
                factoryMethod: {kind: `pushPreviousOnCallStack`, data: undefined}
            },
            storeInsertPrevious: {
                opDefinition: {
                    kind: "HierarchicalStore",
                    create: (store) => [{
                        kind: "static",
                        rustOpHandler: `match prev {
                            AnyType::${store.typeName}(r) => {
                                match insert_${store.name}(&client, &r).await {
                                    Ok(()) => AnyType::None,
                                    Err(err) => ${raiseErrorWithVariableMessage("err")}
                                }
                            },
                            _ => ${raiseErrorWithMessage("Invalid insertion type")}
                        }`,
                        rustEnumMember: `storeInsertPrevious${store.name}`
                    }]
                },
                factoryMethod: (store) => ({kind: `storeInsertPrevious${store.name}`, data: undefined})
            },
        
            storeQuery: {
                factoryMethod(store: CompiledTypes.HierarchicalStore) {
                    return {
                        kind: `storeQuery${store.name}`,
                        data: undefined
                    }
                },
                opDefinition: {
                    kind: "HierarchicalStore",
                    create: (t) => [{
                        kind: "static",
                        rustEnumMember: `storeQuery${t.name}`,
                        rustOpHandler: `
                            let spec = ${generateRustGetAllQuerySpec(t)};
                            match query_interpreter_${t.name}(&spec, &client).await {
                                Ok(out) => AnyType::${t.name}Result(out),
                                Err(err) => ${raiseErrorWithVariableMessage("err")}
                            }
                        `
                    }]
                }
            },
        
            returnVariable: {
                factoryMethod(varname: number) {
                    return {
                        kind: "returnVariable",
                        data: varname
                    }
                },
                opDefinition: {
                    kind: "param",
                    paramType: "usize",
                    rustEnumMember: `returnVariable`,
                    rustOpHandler: ` return state.swap_remove(*op_param)`
                }
            },
        
            returnPrevious: {
                factoryMethod: {    
                    kind: "returnPrevious",
                    data: undefined    
                },
                opDefinition: {
                    kind: "static",
                    rustEnumMember: `returnPrevious`,
                    rustOpHandler: `return prev`
                }
            },
        
            savePrevious: {
                factoryMethod: {        
                    kind: "savePrevious",
                    data: undefined
                },
                opDefinition: {
                    kind: "static",
                    rustEnumMember: `savePrevious`,
                    rustOpHandler:`state.push(prev); AnyType::None`
                }
            },
            
            echoVariable:{
                factoryMethod(n: number) {
                    return {
                        kind: "echoVariable",
                        data: n
                    }
                },
                opDefinition: {                    
                    kind: "param",
                    paramType: "usize",
                    rustEnumMember: `echoVariable`,
                    rustOpHandler: `match state.get(*op_param) {
                        Some(d) => d.clone(),
                        None => ${raiseErrorWithMessage("Echoing variable that does not exist")}
                    }`
                }
            },
            structFieldAccess: {
                factoryMethod(s: CompiledTypes.Struct, fieldname: string) {
                    return {kind: `${s.name}FieldAccess`, data: `${s.name}${fieldname}FieldRef`}
                },
                opDefinition: {
                    kind: "Struct",
                    create(struct: CompiledTypes.Struct) {
                        return [{
                            kind: "param", 
                            paramType: `${struct.name}Field`,
                            rustEnumMember: `${struct.name}FieldAccess`,
                            rustOpHandler: `
                            match prev {
                                AnyType::${struct.name}(inside) => match *op_param {
                                    ${struct.children.Field.map(field => {
                                        const fieldType = field.part.FieldType.differentiate()
                                        
                                        
                                        return `${struct.name}Field::${struct.name}${field.name}FieldRef => ${toAnyType(fieldType, manifest.inScope)}(&inside.${field.name})`
                                    }).join(",\n")}

                                },
                                _ => ${raiseErrorWithMessage("Attempting to reference a field that doesn't exist on current type")}
                            }
                                
                            `
                        }]
                    }
                }
            },
            invokeInstalled: {
                factoryMethod(ref, func_name) {
                    const module = foreignLookup.get(ref.name)
                    if (module === undefined) {
                        throw Error(`Could not find a supported foreign function call for ${JSON.stringify(ref)}\n${JSON.stringify(foreignLookup.keys())}`)
                    }
                    const func = module.functions.get(func_name)
                    if (func === undefined) {
                        throw Error(`Could not find function ${func_name} on ${ref.name}\nhave: ${JSON.stringify(module.functions.keys())}`)
                    }

                    return {kind: `FInvoke${func_name}`, data: undefined}
                },
                opDefinition: {
                    kind: "python3",
                    create(python3) {
                        const module = foreignLookup.get(python3.name)
                        const ret: OpDef[] = []
                        
                        module.functions.forEach((val, key) => {
                            ret.push({
                                kind: "static",
                                rustEnumMember: `FInvoke${key}`,
                                rustOpHandler: `
                                //TODO: eventually move this to the top of the webserver
                                let host = match env::var("${module.service_name.toUpperCase()}_SERVICE_HOST") {
                                    Ok(loc) => loc,
                                    Err(e) => panic!("didn't receive ${module.service_name} location: {}", e)
                                };
                                let response = awc::Client::new()
                                    .put(format!("http://{}${val.url_path}", host)) 
                                    .header("User-Agent", "Actix-web")
                                    .header("Accept", "application/json")
                                    .send_json(&callstack)                          
                                    .await;

                                callstack.clear();

                                match response {
                                    Ok(s) => {
                                        rpc_buffer = Some(s);
                                        AnyType::None                    
                                    },
                                    Err(e) => ${raiseErrorWithVariableMessage("e")}
                                }
                                `,
                            })
                        }) 
                

                        return ret
                    }
                }
            },
            deserializeRpcBufTo: {
                factoryMethod: (t) => {
                    if (t.modification !== "none") {
                        throw Error(`Do not support deserializing to modified types yet.`)
                    }
                    if (foreignLookup.size === 0) {
                        throw Error(`It is impossible to deserialize rpc bufs if there are no rpc calls.`)
                    }
                    return {
                        kind: `deserializeRpcBufTo${t.kind === "Primitive" ? t.val : t.type}`,
                        data: undefined
                    }
                },
                opDefinition: {
                    kind: "rpc",
                    create: (t) => {
                        
                        if (t.modification !== "none") {
                            throw Error(`Do not support deserializing to modified types yet.`)
                        }
                        if (foreignLookup.size === 0) {
                            return []
                        }
                        const ret: OpDef<"static">[] = []
                        switch(t.kind) {
                            case "CustomType":
                                ret.push({
                                    kind: "static",
                                    rustOpHandler: `
                                    match &mut rpc_buffer {
                                        Some(buf) => {
                                            match buf.json().await {
                                                Ok(out) => AnyType::${t.type}Instance(out),
                                                Err(err) => ${raiseErrorWithVariableMessage("err")}
                                            }
                                        },
                                        _ => ${raiseErrorWithMessage("Attempting to deserialize a non existent buffer")}
                                    }`,
                                    rustEnumMember: `deserializeRpcBufTo${t.type}`,
                                })
                                break
                            case "Primitive":
                                
                                ret.push({
                                    kind: "static",
                                    rustEnumMember: `deserializeRpcBufTo${t.val}`,
                                    rustOpHandler: `match &mut rpc_buffer {
                                        Some(buf) => {
                                            match buf.json().await {
                                                Ok(out) => AnyType::${t.val}Instance(out),
                                                Err(err) => ${raiseErrorWithVariableMessage("err")}
                                            }
                                        },
                                        _ => ${raiseErrorWithMessage("Attempting to deserialize a non existent buffer")}
                                    }`,
                                })
                                break

                            default: Utilities.assertNever(t)
                        }

                        return ret
                    }

                }

            }
            
        }
        const addedOperations: AnyOpDef[] = []
        const collectedFactory: any = {}

        for (const o in OpSpec) {
            const opname = o as Ops["kind"]
            const opdef = OpSpec[opname].opDefinition
            switch(opdef.kind) {
                case "HierarchicalStore":
                    manifest.inScope.forEach(e => {
                        if (e.kind !== "HierarchicalStore") {
                            return
                        }
                        addedOperations.push(...opdef.create(e))
                    })
                    break
                case "Struct":
                    manifest.inScope.forEach(e => {
                        if (e.kind !== "Struct" || e.isConduitGenerated) {
                            return
                        }
                        addedOperations.push(...opdef.create(e))
                    })
                    break
                case "static":
                case"param":
                    addedOperations.push(opdef)
                    break
                
                case "python3":
                    manifest.inScope.forEach(e => {
                        if (e.kind === "python3") {
                            addedOperations.push(...opdef.create(e))
                        }
                    })
                    break
                case "rpc":
                    Primitives.forEach(v => {
                        // Bytes are actual data, not a type.
                        addedOperations.push(...opdef.create({kind: "Primitive", modification: "none", val: v}))
                    })
                    manifest.inScope.forEach(m => {
                        if (m.kind === "Struct" && !m.isConduitGenerated) {
                            addedOperations.push(...opdef.create({kind: "CustomType", modification: "none", type: m.name}))
                        }
                    })
                    
                    break
                default: Utilities.assertNever(opdef)
            }       
            collectedFactory[opname] = OpSpec[opname].factoryMethod
        }

        return Promise.resolve({supportedOps: addedOperations, opFactory: collectedFactory, allTypesUnion, additionalRustStructsAndEnums})
    }
}