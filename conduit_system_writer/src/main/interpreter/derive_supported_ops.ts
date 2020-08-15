import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from '../sql'
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { writeOperationInterpreter } from './interpreter_writer';


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

export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, {supportedOps: OpDef[]}> = {
    stepName: "deriving supported operations",
    func: ({manifest}) => {
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
                    const store = i                
                
                    addedOperations.push({
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
                    })

                    addedOperations.push({
                        rustEnumMember: `Query_${store.name}(${store.specName})`,
                        rustOpHandler: `Op::Query_${store.name}(spec) => {
                            match query_interpreter_${store.name}(spec, &client).await {
                                Ok(out) => AnyType::${store.name}Result(out),
                                Err(err) => AnyType::Err(err.to_string())
                            }
                        }`
                    })
                    break
                default: assertNever(i)
            }
        })

        return Promise.resolve({supportedOps: addedOperations })
    }
}