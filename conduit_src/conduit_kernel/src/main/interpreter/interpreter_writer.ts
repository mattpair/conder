import { SchemaType } from '../../../../conduit_parser/src/main/SchemaFactory';
import { Lexicon } from 'conduit_parser';
import { AnyOpDef, OpSpec } from './supported_op_definition';


function writeInternalOpInterpreter(supportedOps: AnyOpDef[]): string {
    return `
    async fn conduit_byte_code_interpreter_internal(mut heap: Vec<InterpreterType>, ops: & Vec<Op>, schemas: &Vec<Schema>, eng: &storage::Engine, stores: &HashMap<String, Schema>) ->Result<InterpreterType, String> {
        let mut stack: Vec<InterpreterType> = vec![];
        let mut next_op_index = 0;
        while next_op_index < ops.len() {

            let err: Option<String> = match &ops[next_op_index] {
                ${supportedOps.map(o => {
                    let header = o.rustEnumMember
                    if (o.kind === "param") {
                        header = `${o.rustEnumMember}(${o.paramType.length === 1 ? "op_param" : o.paramType.map((v, i) => `param${i}`).join(", ")})`
                    }
                    return `Op::${header} => {
                        ${o.rustOpHandler}
                    }`
                }).join(",\n")}
            };
            next_op_index += 1;
        
            match err {
                Some(v) => return Err(format!("error: {}", v)),
                _ => {}
            };
        }
        
            
        
        return Ok(InterpreterType::None);
    }`
}

const rustSchemaTypeDefinition: Record<Exclude<SchemaType, Lexicon.PrimitiveUnion | "Ref">, string> = {
    //Use vecs because it creates a layer of indirection allowing the type to be represented in rust.
    // Also, using vecs presents an opportunity to extend for union type support.
    // All these vecs should be of length 1.
    Optional: "Vec<Schema>",
    Object: "HashMap<String, Schema>",
    Array: "Vec<Schema>",    
}

type InterpreterType = "None" | "Object" | "Array" | Lexicon.PrimitiveUnion


export type InterpreterTypeInstanceMap = {
    [T in InterpreterType]: T extends "None" ? null : 
    T extends "Object" ? Record<string, any> : 
    T extends Lexicon.Symbol.double ? number:
    T extends Lexicon.Symbol.int ? number : 
    T extends "bool" ? boolean :
    T extends "bytes" | "string" ? string :
    T extends "Array" ? any[] :
    T extends "None" ? null :
    never
} 

type InterpreterTypeFactory = Readonly<{
    [P in InterpreterType]: (InterpreterTypeInstanceMap[P] extends null ? null : (a: InterpreterTypeInstanceMap[P]) => InterpreterTypeInstanceMap[P])
}>

type RustInterpreterTypeEnumDefinition = Record<InterpreterType, string[] | null>


export const interpeterTypeFactory: InterpreterTypeFactory = {
    None: null,
    Object: (o) => o,
    double: (d) => {
        return d
    },
    int: (d) => {
        if (Math.round(d) !== d) {
            throw Error(`Integers must not contain decimals`)
        }
        return d
    },
    string: (s) => s,
    bool: (b) => b,
    Array: (a) => a
}

const interpreterTypeDef: RustInterpreterTypeEnumDefinition = {
    // Int must precede double. This will cause the serializer to prefer serializing to ints over doubles.
    int: ["i64"],
    double: ["f64"],
    bool: ["bool"],
    string: ["String"],
    Array: ["Vec<InterpreterType>"],
    Object: ["HashMap<String, InterpreterType>"],
    None: null,
}

export function writeOperationInterpreter(): string {

    const supportedOps: AnyOpDef[] = []
    for (const key in OpSpec) {
        //@ts-ignore
        supportedOps.push(OpSpec[key].opDefinition)            
    }

    return `
    #[derive(Deserialize)]
    #[serde(tag = "kind", content= "data")]
    enum Schema {
        ${[
            "Ref",
            //@ts-ignore
            ...Object.keys(rustSchemaTypeDefinition).map(k => `${k}(${rustSchemaTypeDefinition[k]})`),
            ...Lexicon.Primitives
        ].join(",\n")}
    }

    #[derive(Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum Op {
        ${supportedOps.map(o => {
            if (o.kind === "param") {
                return `${o.rustEnumMember}(${o.paramType.join(", ")})`
            }
            return o.rustEnumMember
        }).join(",\n")}
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    #[serde(untagged)]
    enum InterpreterType {
        ${//@ts-ignore
        Object.keys(interpreterTypeDef).map(k => `${k}${interpreterTypeDef[k] === null ? "" : `(${interpreterTypeDef[k]})`}`).join(",\n")}
    }

    ${writeInternalOpInterpreter(supportedOps)}

    async fn conduit_byte_code_interpreter(state: Vec<InterpreterType>, ops: &Vec<Op>, schemas: &Vec<Schema>, eng: &storage::Engine, stores: &HashMap<String, Schema>) -> impl Responder {
        let output = conduit_byte_code_interpreter_internal(state, ops, schemas, eng, stores).await;
        return match output {
            Ok(data) => HttpResponse::Ok().json(data),
            Err(s) => {
                eprintln!("{}", s);
                HttpResponse::BadRequest().finish()
            }
        }
    }

    fn adheres_to_schema(value: &InterpreterType, schema: &Schema) -> bool {
        return match schema {
            Schema::Ref => true,
            
            Schema::Object(internal) => match value {
                InterpreterType::Object(internal_value) => internal.iter().all(|(k, v)| match internal_value.get(k) {
                    Some(matching_val) => adheres_to_schema(matching_val, &v),
                    None => adheres_to_schema(&InterpreterType::None, &v)              
                }),
                _ => false
            },
            Schema::Array(internal) => match value {
                InterpreterType::Array(internal_value) => internal_value.iter().all(|val| adheres_to_schema(&val, &internal[0])),
                _ => false
            },
            Schema::Optional(internal) => {
                match value {
                    InterpreterType::None => true,
                    _ => adheres_to_schema(value, &internal[0])
                }
            },
            ${Lexicon.Primitives.map(p => {
                if (p === Lexicon.Symbol.double) {
                    return `Schema::double => match value {
                        InterpreterType::double(_) => true,
                        InterpreterType::int(_) => true,
                        _ => false
                    }`
                }
                return `Schema::${p} => {
                    match value {
                        InterpreterType::${p}(${interpreterTypeDef[p].map(_ => `_`).join(", ")}) => true,
                        _ => false
                    }
                }`
        }).join(",\n")}
        }
    }
    `
}