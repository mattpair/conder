import { AnyOpDef, AllTypesMember } from './derive_supported_ops';


export function writeOperationInterpreter(supportedOps: AnyOpDef[], allTypeUnion: AllTypesMember[]): string {
    
    return `

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum Op {
        ${supportedOps.map(o => {
            if (o.kind === "param") {
                return `${o.rustEnumMember}(${o.paramType})`
            }
            return o.rustEnumMember
        }).join(",\n")}
    }

    #[derive(Serialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum AnyType<'exec> {
        ${allTypeUnion.map(t => t.type ? `${t.name}(${t.type})` : t.name).join(",\n")}
    }


    async fn conduit_byte_code_interpreter<'a>(client: &Client, state: &'a mut Vec<AnyType<'a>>, ops: &Vec<Op>) -> impl Responder {
        let mut prev: AnyType= AnyType::None;
        for o in ops {
            prev = match o {
                ${supportedOps.map(o => {
                    let header = o.rustEnumMember
                    if (o.kind === "param") {
                        header = `${o.rustEnumMember}(op_param)`
                    }
                    return `Op::${header} => {
                        ${o.rustOpHandler}
                    }`
                }).join(",\n")}
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