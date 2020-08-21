import { CompiledTypes, Utilities} from 'conduit_parser';
import {generateRustGetAllQuerySpec} from '../sql'
import { assertNever } from 'conduit_parser/dist/src/main/utils';


export interface OpDef {
    readonly rustEnumMember: string
    readonly rustOpHandler: string
}

type StaticOp<KIND> = Op<KIND, "static">
type ParamOp<KIND, P> = {kind: KIND, class: "param", paramType: P}

type OpClass = "static" | "store" | "param"
type Op<KIND, C extends OpClass, P=undefined> = 
{kind: KIND, class: C, paramType?: P}

type Ops = 
ParamOp<"returnVariable", number> | 
StaticOp<"returnPrevious"> |
StaticOp<"savePrevious"> |
ParamOp<"echoVariable", number> |
Op<"storeInsert", "store", number> |
Op<"storeQuery", "store">

type StaticFactory<S> = OpInstance<S>

type ParamFactory<P, S> = (p: P) => OpInstance<S>
type StoreFactory<P> = P extends undefined ? (s: CompiledTypes.HierarchicalStore) => OpInstance  : (s: CompiledTypes.HierarchicalStore, p: P) => OpInstance

type OpFactoryFinder<C extends Ops> = C["class"] extends "static" ? StaticFactory<C["kind"]> : 
C["class"] extends "param" ? ParamFactory<C["paramType"], C["kind"]> :
C["class"] extends "store" ? StoreFactory<C["paramType"]> : never

export type CompleteOpFactory = {
    readonly [P in Ops["kind"]]: OpFactoryFinder<Extract<Ops, {kind: P}>>
};

type StaticOpDef = Readonly<{kind: "static", def: OpDef}>
type DerivedOpDef<T> = Readonly<{kind: "derived", def: (t: T) => OpDef}>

type OpDefFinder<C extends Ops> = C["class"] extends "static" | "param" ? StaticOpDef: 
C["class"] extends "store" ? DerivedOpDef<CompiledTypes.HierarchicalStore> : never



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

class DataContainingType implements AllTypeInternal {
    readonly name: string
    readonly type: string
    constructor(name: string, type: string) {
        this.name = name
        this.type = type
    }
    
    public get returner() : string {
        return `AnyType::${this.name}(output) => return HttpResponse::Ok().json(output)`
    }
    
}



export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, {supportedOps: OpDef[], opFactory: CompleteOpFactory, allTypesUnion: AllTypesMember[]}> = {
    stepName: "deriving supported operations",
    func: ({manifest}) => {
        const allTypesUnion: AllTypeInternal[] = [
            {name: "None", returner: `AnyType::None => return HttpResponse::Ok().finish()`},
            new DataContainingType("Err", "String")
        ]
        manifest.inScope.forEach(v => {
            
        
            switch (v.kind) {
                case "Struct":
                    allTypesUnion.push(
                        new DataContainingType(v.name, v.name),
                        new DataContainingType(`Many${v.name}`, `Vec<${v.name}>`)
                    )                    
                    break
                case "HierarchicalStore":

                    allTypesUnion.push(
                        new DataContainingType(`${v.name}Result`, `Vec<${v.typeName}>`)
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

            storeInsert: {
                factoryMethod(store: CompiledTypes.HierarchicalStore, varname: number) {
                    return {
                        kind: `storeInsert${store.name}`,
                        data: varname
                    }
                },
                opDefinition: {
                    kind: "derived",
                    def: (t) => ({
                                rustOpHandler: `
                    Op::storeInsert${t.name}(var_id) => {
                        
        
                        let to_insert = match state.get(*var_id) {
                        
                            Some(v) => match v {
                                AnyType::${t.typeName}(r) => r,
                                _ => {
                                    println!("invalid insertion type");
                                    return HttpResponse::BadRequest().finish();
                                }
                            },
                            None => {
                                println!("Could not find variable for insertion");
                                return HttpResponse::BadRequest().finish();
                            }
                        };
        
                        match insert_${t.name}(&client, &to_insert).await {
                            Ok(()) => AnyType::None,
                            Err(err) => AnyType::Err(err.to_string())
                        }
                    }`,
                    rustEnumMember: `storeInsert${t.name}(usize)`
                    })
                }
            },
        
            storeQuery: {
                factoryMethod(store: CompiledTypes.HierarchicalStore) {
                    return {
                        kind: `storeQuery${store.name}`,
                        data: undefined
                    }
                },
                opDefinition: {
                    kind: "derived",
                    def: (t) => ({
                        rustEnumMember: `storeQuery${t.name}`,
                        rustOpHandler: `Op::storeQuery${t.name} => {
                            let spec = ${generateRustGetAllQuerySpec(t)};
                            match query_interpreter_${t.name}(&spec, &client).await {
                                Ok(out) => AnyType::${t.name}Result(out),
                                Err(err) => AnyType::Err(err.to_string())
                            }
                        }`
                    })
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
                    kind: "static",
                    def: {
                        rustEnumMember: `returnVariable(usize)`,
                        rustOpHandler: `
                        Op::returnVariable(var_id) => match state.get(*var_id) {
                            Some(data) => ${returnAnyType("data")},
                            None => {
                                println!("attempting to return a value that doesn't exist");
                                return HttpResponse::BadRequest().finish();
                            }
                        }`
                    }
                }
            },
        
            returnPrevious: {
                factoryMethod: {    
                    kind: "returnPrevious",
                    data: undefined    
                },
                opDefinition: {
                    kind: "static",
                    def: {
                        rustEnumMember: `returnPrevious`,
                        rustOpHandler: `
                        Op::returnPrevious => ${returnAnyType("prev")}`
                    }
                }
            },
        
            savePrevious: {
                factoryMethod: {        
                    kind: "savePrevious",
                    data: undefined
                },
                opDefinition: {
                    kind: "static",
                    def: {
                        rustEnumMember: `savePrevious`,
                        rustOpHandler:`Op::savePrevious => {state.push(prev); AnyType::None}`
                    }
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
                    kind: "static",
                    def: {
                        rustEnumMember: `echoVariable(usize)`,
                        rustOpHandler: `Op::echoVariable(index) => match state.get(*index) {
                            Some(d) => d.clone(),
                            None => AnyType::Err("Echoing variable that does not exist".to_string())
                        }`
                    }
                }
            }
            
        }
        const addedOperations: OpDef[] = []
        const collectedFactory: any = {}

        for (const o in OpSpec) {
            const opname = o as Ops["kind"]
            const opdef = OpSpec[opname].opDefinition
            switch(opdef.kind) {
                case "derived":
                    manifest.inScope.forEach(e => {
                        if (e.kind !== "HierarchicalStore") {
                            return
                        }
                        addedOperations.push(opdef.def(e))
                    })
                    
                    
                    break
                case "static":
                    addedOperations.push(opdef.def)
                    break
            }       
            collectedFactory[opname] = OpSpec[opname].factoryMethod
        }

        
        const o = Object.entries(OpSpec).map(e => {
            return 
        })
        

        manifest.inScope.forEach(i => {
            switch(i.kind) {
                case "Enum":
                case "Struct":
                case "Function":
                    break
    
                case "HierarchicalStore":                
                    addedOperations.push()
                    break
                default: assertNever(i)
            }
        })

        return Promise.resolve({supportedOps: addedOperations, opFactory: collectedFactory, allTypesUnion})
    }
}