import { CompiledTypes } from "conduit_compiler";


export function writeOperationInterpreter(manifest: CompiledTypes.Manifest): string {
    const op_match: string[] = []
    const op_type: string[] = []
    const op_result: string[] = [
        "None",
        "Err(String)"
    ]

    manifest.supportedOperations.forEach(op => {
        switch(op.kind) {
            case "insert": {
                const store = manifest.inScope.getEntityOfType(op.storeName, "HierarchicalStore")
                const op_name = `Insert_${op.storeName}`
                op_type.push(`${op_name}(${store.typeName})`)

                op_match.push(`
                Op::${op_name}(v) => {
                    return match insert_${op.storeName}(&client, v).await {
                        Ok(()) => OpResult::None,
                        Err(err) => OpResult::Err(err.to_string())
                    };
                }`)
                break
            }
            case "noop":
                op_type.push(`Noop`)
                op_match.push(`Op::Noop => OpResult::None`)
                break
            case "query": {
                const store = manifest.inScope.getEntityOfType(op.storeName, "HierarchicalStore")
                const op_name = `Query_${op.storeName}`
                op_type.push(`${op_name}(${store.specName})`)
                const result_name = `QueryResult${op.storeName}`
                op_result.push(`${result_name}(Vec<${store.typeName}>)`)
                op_match.push(`
                Op::${op_name}(v) => {
                    return match query_interpreter_${store.name}(v, &client).await {
                        Ok(out) => OpResult::${result_name}(out),
                        Err(err) => OpResult::Err(err.to_string())
                    };
                }`)
                break
            }
            case "return input":
                break
        }
    })

    return `
    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind")]
    enum Op {
        ${op_type.join(",\n")}
    }

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind")]
    enum OpResult {
        ${op_result.join(",\n")}
    }

    async fn op_interpreter(op: Op, client: &Client) -> OpResult {
        return match op {
            ${op_match.join(",\n")}
        };
    }
        
    `
}