import { AnyOpDef, AllTypesMember } from './derive_supported_ops';
import { InstallModuleLookup } from 'conduit_foreign_install/dist/src/main/types';


function writeInternalOpInterpreter(supportedOps: AnyOpDef[], allTypeUnion: AllTypesMember[], foreignLookup: InstallModuleLookup): string {
    return `
    async fn conduit_byte_code_interpreter_internal<'a>(client: &Client, state: &'a mut Vec<AnyType<'a>>, ops: &Vec<Op>) -> AnyType<'a> {
        let mut prev: AnyType<'a>= AnyType::None;
        let mut callstack: Vec<AnyType<'a>> = Vec::new();
        ${foreignLookup.size > 0 ? "let mut rpc_buffer: Option<awc::ClientResponse<_>> = Option::None;": ""}
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
                AnyType::Err(_) => return prev,
                _ => {}  
            };
        }
        return AnyType::None;
    }`
}

export function writeOperationInterpreter(supportedOps: AnyOpDef[], allTypeUnion: AllTypesMember[], foreignLookup: InstallModuleLookup): string {

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

    ${writeInternalOpInterpreter(supportedOps, allTypeUnion, foreignLookup)}

    async fn conduit_byte_code_interpreter<'a>(client: &Client, state: &'a mut Vec<AnyType<'a>>, ops: &Vec<Op>) -> impl Responder {
        return match conduit_byte_code_interpreter_internal(client, state, ops).await {
            ${allTypeUnion.map(a => a.http_returner).join(",\n")}
        };
    }
    `
}