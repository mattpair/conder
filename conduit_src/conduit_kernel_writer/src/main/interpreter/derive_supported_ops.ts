import { CompiledTypes, Utilities, Lexicon} from 'conduit_parser';
import {generateRustGetAllQuerySpec} from '../sql'
import { toAnyType } from '../toAnyType';
import { TypeWriter } from '../type_writing/type_writer';
import {InstallTypes} from 'conduit_foreign_install'

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

type OpClass = "static" | "store" | "param" | "struct" | "python3"
type Op<KIND, C extends OpClass, P=undefined, P_LIFETIME extends ParamLifetime ="runtime"> = 
{kind: KIND, class: C, paramType?: P, param_lifetime: P_LIFETIME}

type Ops = 
ParamOp<"returnVariable", number, "runtime"> |
StaticOp<"returnPrevious"> |
StaticOp<"savePrevious"> |
ParamOp<"echoVariable", number, "runtime"> |
Op<"storeInsertPrevious", "store"> |
Op<"storeQuery", "store"> |
Op<"structFieldAccess", "struct", string> |
Op<"invokeInstalled", "python3", string, "compile">

type StaticFactory<S> = OpInstance<S>

type ParamFactory<P, S> = (p: P) => OpInstance<S>

type EntityCentricOpFactory<P, E extends CompiledTypes.Entity> = P extends undefined ? (s: E) => OpInstance  : (s: E, p: P) => OpInstance

type OpFactoryFinder<C extends Ops> = C["class"] extends "static" ? StaticFactory<C["kind"]> : 
C["class"] extends "param" ? ParamFactory<C["paramType"], C["kind"]> :
C["class"] extends "store"  ? EntityCentricOpFactory<C["paramType"], CompiledTypes.HierarchicalStore> : 
C["class"] extends "struct" ? EntityCentricOpFactory<C["paramType"], CompiledTypes.Struct> : 
C["class"] extends "python3" ? EntityCentricOpFactory<C["paramType"], CompiledTypes.Python3Install> : never

export type CompleteOpFactory = {
    readonly [P in Ops["kind"]]: OpFactoryFinder<Extract<Ops, {kind: P}>>
};

type ChooseOpDef<O extends Ops> = O["paramType"] extends undefined ? 
OpDef[] : 
O["param_lifetime"] extends "compile" ? OpDef[]: OpDefWithParameter[]

type EntityCentricOpDef<O extends Ops, E extends CompiledTypes.Entity> = Readonly<{kind: E["kind"], create: (t: E) => ChooseOpDef<O>}>
type OpDefFinder<C extends Ops> = C["class"] extends "static" ? OpDef: 
C["class"] extends "param" ? OpDefWithParameter :
C["class"] extends "store" ? EntityCentricOpDef<C, CompiledTypes.HierarchicalStore> : 
C["class"] extends "struct" ? EntityCentricOpDef<C, CompiledTypes.Struct> : 
C["class"] extends "python3" ? EntityCentricOpDef<C, CompiledTypes.Python3Install> : never



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
    name: string, type?: string
}>

interface AllTypeInternal extends AllTypesMember  {
    readonly returner: string
}

type AnyTypeDefOption = {
    exemptFromUsingReferences?: boolean
}

class DataContainingType implements AllTypeInternal {
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
            new DataContainingType(`Many${baseName}`,`Vec<${baseType}>`),
            new DataContainingType(`Optional${baseName}`, `Option<${baseType}>`)
        ]
    }
    
    public get returner() : string {
        return `AnyType::${this.name}(output) => return HttpResponse::Ok().json(output)`
    }
    
}

export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest, foreignLookup: InstallTypes.InstallModuleLookup}, 
{supportedOps: AnyOpDef[], opFactory: CompleteOpFactory, allTypesUnion: AllTypesMember[], additionalRustStructsAndEnums: string[]}> = {
    stepName: "deriving supported operations",
    func: ({manifest, foreignLookup}) => {
        const allTypesUnion: AllTypeInternal[] = [
            {name: "None", returner: `AnyType::None => return HttpResponse::Ok().finish()`},
            new DataContainingType("Err", "String", {exemptFromUsingReferences: true})
        ]

        Lexicon.Primitives.forEach(p => {
            const r = TypeWriter.rust.primitive[p]
            allTypesUnion.push(...DataContainingType.allPossibleDataContainingTypes(p, r))
        })
        function returnErrorWithMessage(s: string): string {
            return `AnyType::Err("${s}".to_string())`
        }
        function returnWithVariableErrorMessage(v: string): string {
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
        

        const returnAnyType = (varname: string) => {
            return `match ${varname} {
                ${allTypesUnion.map(t => t.returner).join(",\n")}
            }
            `
        }

        const OpSpec: CompleteOpSpec = {
            storeInsertPrevious: {
                opDefinition: {
                    kind: "HierarchicalStore",
                    create: (store) => [{
                        kind: "static",
                        rustOpHandler: `match prev {
                            AnyType::${store.typeName}(r) => {
                                match insert_${store.name}(&client, &r).await {
                                    Ok(()) => AnyType::None,
                                    Err(err) => ${returnWithVariableErrorMessage("err")}
                                }
                            },
                            _ => {
                                println!("invalid insertion type");
                                return HttpResponse::BadRequest().finish();
                            }
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
                                Err(err) => ${returnWithVariableErrorMessage("err")}
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
                    rustOpHandler: `
                    match state.get(*op_param) {
                        Some(data) => ${returnAnyType("data")},
                        None => {
                            println!("attempting to return a value that doesn't exist");
                            return HttpResponse::BadRequest().finish();
                        }
                    }`
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
                    rustOpHandler: `
                    ${returnAnyType("prev")}`
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
                        None => ${returnErrorWithMessage("Echoing variable that does not exist")}
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
                                _ => ${returnErrorWithMessage("Attempting to reference a field that doesn't exist on current type")}
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
                        throw Error(`Could not find a supported foreign function call for ${JSON.stringify(ref)}`)
                    }
                    const func = module.functions.get(func_name)
                    if (func === undefined) {
                        throw Error(`Could not find function ${func_name} on ${ref.name}`)
                    }

                    return {kind: `FInvoke${func_name}`, data: undefined}
                },
                opDefinition: {
                    kind: "python3",
                    create(python3) {
                        const module = foreignLookup.get(python3.name)
                        const ret: OpDef[] = []
                        for (const key in module.functions) {
                            ret.push({
                                kind: "static",
                                rustEnumMember: `FInvoke${key}`,
                                rustOpHandler: `
                                let response = awc::Client::new()
                                    .get("${module.service_name}${module.functions.get(key).url_path}") // <- Create request builder
                                    .header("User-Agent", "Actix-web")
                                    .send()                          // <- Send http request
                                    .await;
                                match response {
                                    Fut(out) => {
                                        match out.await {
                                            Ok(res) => {
                                                match res.body().await {
                                                    Ok(bytes) => AnyType::bytes(bytes.borrow().into_vec()),
                                                    Err(err) => ${returnWithVariableErrorMessage("err")}
                                                }
                                            },
                                            Err(err) => ${returnWithVariableErrorMessage("err")}
                                        }
                                    },
                                    Err(e) => ${returnWithVariableErrorMessage("err")}
                                }
                                `,
                            })
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
                    //TODO enable once ready
                    break
                default: Utilities.assertNever(opdef)
            }       
            collectedFactory[opname] = OpSpec[opname].factoryMethod
        }

        return Promise.resolve({supportedOps: addedOperations, opFactory: collectedFactory, allTypesUnion, additionalRustStructsAndEnums})
    }
}