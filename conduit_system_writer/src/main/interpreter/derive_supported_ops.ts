import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from '../sql'
import { assertNever } from 'conduit_compiler/dist/src/main/utils';


export interface OpDef {
    readonly rustEnumMember: string
    readonly rustOpHandler: string
}

interface OpInstance {
    // These fields are based on the Interpreter writer's op field.
    kind: string
    data: any
}

export interface OpFactory {
    makeReturnVariableOp(varname: string): OpInstance
    makeReturnPrevious(): OpInstance
    makeInsert(store: CompiledTypes.HierarchicalStore, varname: string): OpInstance
    makeQuery(store: CompiledTypes.HierarchicalStore): OpInstance
}

class TheOpFactory implements OpFactory {

    makeInsert(store: CompiledTypes.HierarchicalStore, varname: string): OpInstance {
        return undefined
    }

    makeQuery(store: CompiledTypes.HierarchicalStore): OpInstance {
        return undefined
    }

    inferStoreOps(store: CompiledTypes.HierarchicalStore): OpDef[] {
        const insertOp = {
            rustOpHandler: `
            Op::Insert_${store.name}(insert_var_name) => {
                let to_insert = match state.get(insert_var_name).unwrap() {
                    AnyType::${store.typeName}(r) => r,
                    _ => panic!("invalid insertion type")
                };

                match insert_${store.name}(&client, &to_insert).await {
                    Ok(()) => AnyType::None,
                    Err(err) => AnyType::Err(err.to_string())
                }
            }`,
            rustEnumMember: `Insert_${store.name}(String)`
        }
        const queryOp = {
            rustEnumMember: `Query_${store.name}(${store.specName})`,
            rustOpHandler: `Op::Query_${store.name}(spec) => {
                match query_interpreter_${store.name}(spec, &client).await {
                    Ok(out) => AnyType::${store.name}Result(out),
                    Err(err) => AnyType::Err(err.to_string())
                }
            }`
        }

        return [insertOp, queryOp]
    }

    makeReturnVariableOp(varname: string): OpInstance {
        return undefined
    }

    makeReturnPrevious(): OpInstance {
        return undefined
    }
}

export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, {supportedOps: OpDef[], opFactory: OpFactory}> = {
    stepName: "deriving supported operations",
    func: ({manifest}) => {

        const opFactory = new TheOpFactory()
        const addedOperations: OpDef[] = [
            {
                rustEnumMember: `Return(String)`,
                rustOpHandler: `
                Op::Return(varname) => match state.get(varname) {
                    Some(data) => {
                        return HttpResponse::Ok().json(data);
                    },
                    None => {
                        println!("attempting to return a value that doesn't exist");
                        return HttpResponse::BadRequest().finish();
                    }
                }`
            },
            {
                rustEnumMember: `ReturnPrev`,
                rustOpHandler: `
                Op::ReturnPrev => return HttpResponse::Ok().json(prev)`
            }
        ]

        manifest.inScope.forEach(i => {
            switch(i.kind) {
                case "Enum":
                case "Struct":
                    break
    
                case "HierarchicalStore":                
                    addedOperations.push(...opFactory.inferStoreOps(i))
                    break
                default: assertNever(i)
            }
        })

        return Promise.resolve({supportedOps: addedOperations, opFactory})
    }
}