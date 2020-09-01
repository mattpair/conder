import { CompiledTypes, Utilities, Lexicon} from 'conduit_parser';
import {generateRustGetAllQuerySpec} from '../sql'
import { assertNever } from 'conduit_parser/dist/src/main/utils';
import { toAnyType } from '../toAnyType';
import { primitiveToRustType } from '../primitiveToRustType';

type OpDef<K="static"> = {
    readonly kind: K
    readonly rustEnumMember: string
    readonly rustOpHandler: string
}
type OpDefWithParameter = OpDef<"param"> & {readonly paramType: string}
export type AnyOpDef = OpDef | OpDefWithParameter

type StaticOp<KIND> = Op<KIND, "static">
type ParamOp<KIND, P> = {kind: KIND, class: "param", paramType: P}

type OpClass = "static" | "store" | "param" | "struct"
type Op<KIND, C extends OpClass, P=undefined> = 
{kind: KIND, class: C, paramType?: P}

type Ops = 
ParamOp<"returnVariable", number> |
StaticOp<"returnPrevious"> |
StaticOp<"savePrevious"> |
ParamOp<"echoVariable", number> |
Op<"storeInsert", "store", number> |
Op<"storeQuery", "store"> |
Op<"structFieldAccess", "struct", string>

type StaticFactory<S> = OpInstance<S>

type ParamFactory<P, S> = (p: P) => OpInstance<S>
type EntityCentricOpFactory<P, E extends CompiledTypes.Entity> = P extends undefined ? (s: E) => OpInstance  : (s: E, p: P) => OpInstance

type OpFactoryFinder<C extends Ops> = C["class"] extends "static" ? StaticFactory<C["kind"]> : 
C["class"] extends "param" ? ParamFactory<C["paramType"], C["kind"]> :
C["class"] extends "store" ? EntityCentricOpFactory<C["paramType"], CompiledTypes.HierarchicalStore> : 
C["class"] extends "struct" ? EntityCentricOpFactory<C["paramType"], CompiledTypes.Struct> : never

export type CompleteOpFactory = {
    readonly [P in Ops["kind"]]: OpFactoryFinder<Extract<Ops, {kind: P}>>
};

type ChooseOpDef<O extends Ops> = O["paramType"] extends undefined ? OpDef : OpDefWithParameter
type EntityCentricOpDef<O extends Ops, E extends CompiledTypes.Entity> = Readonly<{kind: E["kind"], create: (t: E) => ChooseOpDef<O>}>
type OpDefFinder<C extends Ops> = C["class"] extends "static" ? OpDef: 
C["class"] extends "param" ? OpDefWithParameter :
C["class"] extends "store" ? EntityCentricOpDef<C, CompiledTypes.HierarchicalStore> : 
C["class"] extends "struct" ? EntityCentricOpDef<C, CompiledTypes.Struct> : never



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



export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, 
{supportedOps: AnyOpDef[], opFactory: CompleteOpFactory, allTypesUnion: AllTypesMember[], additionalRustStructsAndEnums: string[]}> = {
    stepName: "deriving supported operations",
    func: ({manifest}) => {
        const allTypesUnion: AllTypeInternal[] = [
            {name: "None", returner: `AnyType::None => return HttpResponse::Ok().finish()`},
            new DataContainingType("Err", "String")
        ]

        Lexicon.Primitives.forEach(p => {
            const r = primitiveToRustType(p)
            allTypesUnion.push(...DataContainingType.allPossibleDataContainingTypes(p, r))
            
        })
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
                    kind: "HierarchicalStore",
                    create: (t) => ({
                        kind: "param",
                        paramType: "usize",

                        rustOpHandler: `
                            let to_insert = match state.get(*op_param) {
                    
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
                            }`,
                    rustEnumMember: `storeInsert${t.name}`
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
                    kind: "HierarchicalStore",
                    create: (t) => ({
                        kind: "static",
                        rustEnumMember: `storeQuery${t.name}`,
                        rustOpHandler: `
                            let spec = ${generateRustGetAllQuerySpec(t)};
                            match query_interpreter_${t.name}(&spec, &client).await {
                                Ok(out) => AnyType::${t.name}Result(out),
                                Err(err) => AnyType::Err(err.to_string())
                            }
                        `
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
                        None => AnyType::Err("Echoing variable that does not exist".to_string())
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
                        return {
                            kind: "param", 
                            paramType: `${struct.name}Field`,
                            rustEnumMember: `${struct.name}FieldAccess`,
                            rustOpHandler: `
                            match prev {
                                AnyType::${struct.name}(inside) => match *op_param {
                                    ${struct.children.Field.map(field => {
                                        const fieldType = field.part.FieldType.differentiate()
                                        
                                        
                                        return `${struct.name}Field::${struct.name}${field.name}FieldRef => ${toAnyType(fieldType, manifest.inScope)}(inside.${field.name})`
                                    }).join(",\n")}

                                },
                                _ => AnyType::Err("Attempting to reference a field that doesn't exist on current type".to_string())
                            }
                                
                            `
                        }
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
                        addedOperations.push(opdef.create(e))
                    })
                    break
                case "Struct":
                    manifest.inScope.forEach(e => {
                        if (e.kind !== "Struct" || e.isConduitGenerated) {
                            return
                        }
                        addedOperations.push(opdef.create(e))
                    })
                    break
                case "static":
                case"param":
                    addedOperations.push(opdef)
                    break
                
                default: Utilities.assertNever(opdef)
            }       
            collectedFactory[opname] = OpSpec[opname].factoryMethod
        }

        return Promise.resolve({supportedOps: addedOperations, opFactory: collectedFactory, allTypesUnion, additionalRustStructsAndEnums})
    }
}