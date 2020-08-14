import { AnyOp } from './derive_supported_ops';
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { CompiledTypes } from "conduit_compiler";

export function writeOperationInterpreter(manifest: CompiledTypes.Manifest, supportedOps: AnyOp[]): string {
    
    const op_match: string[] = []
    const op_type: {name: string, containing: {name: string, type: string}[]}[] = []
    const ALL_TYPES_UNION: {name: string, type?: string}[] = [
        {name: "None"},
        {name: "Err", type: "String"}
    ]
    manifest.inScope.forEach(v => {
        if (v.kind !== "Struct") {
            return
        }

        ALL_TYPES_UNION.push({name: `${v.name}Instance`, type: v.name})
    })

    supportedOps.forEach(op => {
        switch(op.kind) {
            case "insert": {
                const store = manifest.inScope.getEntityOfType(op.storeName, "HierarchicalStore")
                const op_name = `Insert_${op.storeName}`
                op_type.push({name: op_name, containing: [{name: "insert_var_name", type: "String"}]})
                
                op_match.push(`
                Instr::${op_name}{insert_var_name} => {
                    let to_insert = match state.get(insert_var_name).unwrap() {
                        ${store.typeName}Instance(r) => r,
                        _ => panic!("invalid insertion type")
                    };

                    match insert_${op.storeName}(&client, to_insert).await {
                        Ok(()) => AnyType::None,
                        Err(err) => AnyType::Err(err.to_string())
                    };
                }`)
                break
            }

            case "query": {
                const store = manifest.inScope.getEntityOfType(op.storeName, "HierarchicalStore")
                const op_name = `Query_${op.storeName}`
                op_type.push({name: op_name, containing: [{name: "data", type: store.specName}]})
                const result_name = `QueryResult${op.storeName}`
                ALL_TYPES_UNION.push({name: result_name, type: `Vec<${store.typeName}>`})
                op_match.push(`
                Instr::${op_name}(v) => {
                    match query_interpreter_${store.name}(v, &client).await {
                        Ok(out) => AnyType::${result_name}(out),
                        Err(err) => AnyType::Err(err.to_string())
                    };
                }`)
                break
            }

            case "returnPrevious":
            case "return":
                break
            
            default: assertNever(op)
        }
    })

    const InstrBody: string = `
    ${op_type.map(o => {
        if (o.containing.length > 0) {
            return `${o.name}{${o.containing.map(c => `${c.name}: ${c.type}`).join(", ")}}`
        } 
        return o.name
    }).join("\n")}
    `


    return `

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum Instr {
        ${InstrBody}
    }

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum AnyType {
        ${ALL_TYPES_UNION.map(t => t.type ? `${t.name}(${t.type})` : t.name).join(",\n")}
    }

    // ControlFlow Interpreter:
    enum CF {
        Return(string),
        ReturnPrevious
    }


    enum CONDUIT_BYTE_CODE {
        ControlFlow(CF),
        Instruction(Instr)
    }

    async fn conduit_byte_code_interpreter(client: &Client, state: mut &HashMap<String, AnyType>, ops: Vec<CONDUIT_BYTE_CODE>) -> impl Responder {
        let mut prev: AnyType= AnyType::None;
        while let Some(o) = ops.pop() {
            match o {
                ControlFlow(c) => {
                    match c {
                        ReturnPrevious => {
                            return HttpResponse::Ok().json(prev);
                        },

                        Return(s) => state.get(&s) {
                            Some(data) => {
                                return HttpResponse::Ok().json(out);
                            },
                            None => panic!("attempting to return a value that doesn't exist")
                        }
                    };
                },
                Instruction(i) => {
                    prev = match i {
                        ${op_match.join(",\n")}
                    };

                    if let Err(e) = prev {
                        println!("Error: {}", e);
                        return HttpResponse::BadRequest().finish();
                    }
                }
            };
        }
        return HttpResponse::Ok().json(AnyType::None);

    }

    `
}