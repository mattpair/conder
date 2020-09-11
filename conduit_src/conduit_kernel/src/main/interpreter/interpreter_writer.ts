import { Lexicon } from 'conduit_parser';
import { AnyOpDef, OpSpec } from './supported_op_definition';


function writeInternalOpInterpreter(supportedOps: AnyOpDef[]): string {
    return `
    async fn conduit_byte_code_interpreter_internal(mut heap: Vec<InterpreterType>, ops: & Vec<Op>) ->InterpreterType {
        let mut err: Option<String> = None;
        let mut stack: Vec<InterpreterType> = vec![];
        let mut next_op_index = 0;
        while next_op_index < ops.len() {

            err = match &ops[next_op_index] {
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
            next_op_index += 1;
        
            match err {
                Some(v) => panic!("error: {}", v),
                _ => {}
            };
        }
        
            
        
        return InterpreterType::None;
    }`
}

export function writeOperationInterpreter(): string {
   const p = {
        double: "f64",
        int32: "i32",
        int64: "i64",
        float: "f32",
        uint32: "i32",
        uint64: "i64",
        bool: "bool",
        string: "String",
        bytes: "Vec<u8>"
    }
    const supportedOps: AnyOpDef[] = []
    for (const key in OpSpec) {
        //@ts-ignore
        supportedOps.push(OpSpec[key].opDefinition)            
    }
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

    #[derive(Serialize, Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum InterpreterType {
        None,
        Object(HashMap<String, InterpreterType>),
        Array(Vec<InterpreterType>),
        ${Lexicon.Primitives.map(v => `${v}(${p[v]})`).join(",\n")}
    }

    ${writeInternalOpInterpreter(supportedOps)}

    async fn conduit_byte_code_interpreter(state: Vec<InterpreterType>, ops: &Vec<Op>) -> impl Responder {
        let output = conduit_byte_code_interpreter_internal(state, ops).await;
        return HttpResponse::Ok().json(output)
    }
    `
}