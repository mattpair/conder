import { OpDef } from './derive_supported_ops';
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { CompiledTypes } from "conduit_compiler";

export function writeOperationInterpreter(manifest: CompiledTypes.Manifest, supportedOps: OpDef[]): string {
    
    const ALL_TYPES_UNION: {name: string, type?: string}[] = [
        {name: "None"},
        {name: "Err", type: "String"}
    ]
    manifest.inScope.forEach(v => {
        

        switch (v.kind) {
            case "Struct":
                ALL_TYPES_UNION.push({name: v.name, type: v.name})
                ALL_TYPES_UNION.push({name: `Many${v.name}`, type: `Vec<${v.name}>`})
                break
            case "HierarchicalStore":
                
                ALL_TYPES_UNION.push({name: `${v.name}Result`, type: `Vec<${v.typeName}>`})
        }        
    })

    return `

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum Op {
        ${supportedOps.map(o => o.rustEnumMember).join(",\n")}
    }

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum AnyType {
        ${ALL_TYPES_UNION.map(t => t.type ? `${t.name}(${t.type})` : t.name).join(",\n")}
    }


    async fn conduit_byte_code_interpreter(client: &Client, state: &HashMap<String, AnyType>, ops: &Vec<Op>) -> impl Responder {
        let mut prev: AnyType= AnyType::None;
        for o in ops {
            prev = match o {
                ${supportedOps.map(o => o.rustOpHandler).join(",\n")}
            };

            match prev {
                AnyType::Err(e) => {
                    println!("Error: {}", e);
                    return HttpResponse::BadRequest().finish();
                },
                _ => {}  
            };
        }
        return HttpResponse::Ok().json(AnyType::None);

    }

    `
}