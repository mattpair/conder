import { OpDef, AllTypesMember } from './derive_supported_ops';
import { assertNever } from 'conduit_parser/dist/src/main/utils';
import { CompiledTypes } from "conduit_parser";


export function writeOperationInterpreter(supportedOps: OpDef[], allTypeUnion: AllTypesMember[]): string {
    
    
    return `

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum Op {
        ${supportedOps.map(o => o.rustEnumMember).join(",\n")}
    }

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum AnyType {
        ${allTypeUnion.map(t => t.type ? `${t.name}(${t.type})` : t.name).join(",\n")}
    }


    async fn conduit_byte_code_interpreter(client: &Client, state: &mut Vec<AnyType>, ops: &Vec<Op>) -> impl Responder {
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