import { CompiledTypes, Utilities} from 'conduit_compiler';
import {generateRustGetAllQuerySpec} from '../sql'
import { assertNever } from 'conduit_compiler/dist/src/main/utils';


export interface OpDef {
    readonly rustEnumMember: string
    readonly rustOpHandler: string
}

export interface OpInstance {
    // These fields are based on the Interpreter writer's op field.
    kind: string
    data: any
}

export interface OpFactory {
    makeReturnVariableOp(var_id: number): OpInstance
    makeReturnPrevious(): OpInstance
    makeInsert(store: CompiledTypes.HierarchicalStore, varname: number): OpInstance
    makeQuery(store: CompiledTypes.HierarchicalStore): OpInstance
}

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

class TheOpFactory implements OpFactory {

    makeInsert(store: CompiledTypes.HierarchicalStore, varname: number): OpInstance {
        return {
            kind: this.insertOpName(store),
            data: varname
        }
    }

    makeQuery(store: CompiledTypes.HierarchicalStore): OpInstance {
        return {
            kind: this.queryOpName(store),
            data: undefined
        }
    }

    private insertOpName(store: CompiledTypes.HierarchicalStore): string {
        return `Insert_${store.name}`
    }

    private queryOpName(store: CompiledTypes.HierarchicalStore): string {
        return `Query_${store.name}`      
    }

    inferStoreOps(store: CompiledTypes.HierarchicalStore): OpDef[] {
        const insertOp = {
            rustOpHandler: `
            Op::${this.insertOpName(store)}(var_id) => {
                

                let to_insert = match state.get(*var_id) {
                
                    Some(v) => match v {
                        AnyType::${store.typeName}(r) => r,
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

                match insert_${store.name}(&client, &to_insert).await {
                    Ok(()) => AnyType::None,
                    Err(err) => AnyType::Err(err.to_string())
                }
            }`,
            rustEnumMember: `${this.insertOpName(store)}(usize)`
        }
        const queryOp = {
            rustEnumMember: `${this.queryOpName(store)}`,
            rustOpHandler: `Op::${this.queryOpName(store)} => {
                let spec = ${generateRustGetAllQuerySpec(store)};
                match query_interpreter_${store.name}(&spec, &client).await {
                    Ok(out) => AnyType::${store.name}Result(out),
                    Err(err) => AnyType::Err(err.to_string())
                }
            }`
        }

        return [insertOp, queryOp]
    }

    makeReturnVariableOp(varname: number): OpInstance {
        return {
            kind: "Return",
            data: varname
        }
    }

    makeReturnPrevious(): OpInstance {
        return {
            kind: "ReturnPrev",
            data: undefined
        }
    }
}

export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, {supportedOps: OpDef[], opFactory: OpFactory, allTypesUnion: AllTypesMember[]}> = {
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

        const opFactory = new TheOpFactory()
        const addedOperations: OpDef[] = [
            {
                rustEnumMember: `Return(usize)`,
                rustOpHandler: `
                Op::Return(var_id) => match state.get(*var_id) {
                    Some(data) => ${returnAnyType("data")},
                    None => {
                        println!("attempting to return a value that doesn't exist");
                        return HttpResponse::BadRequest().finish();
                    }
                }`
            },
            {
                rustEnumMember: `ReturnPrev`,
                rustOpHandler: `
                Op::ReturnPrev => ${returnAnyType("prev")}`
            }
        ]

        manifest.inScope.forEach(i => {
            switch(i.kind) {
                case "Enum":
                case "Struct":
                case "Function":
                    break
    
                case "HierarchicalStore":                
                    addedOperations.push(...opFactory.inferStoreOps(i))
                    break
                default: assertNever(i)
            }
        })

        return Promise.resolve({supportedOps: addedOperations, opFactory, allTypesUnion})
    }
}