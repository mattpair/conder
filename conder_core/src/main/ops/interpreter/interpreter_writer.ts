import { SchemaType, PrimitiveUnion, Primitives } from '../SchemaFactory';
import { AnyOpDef, OpSpec } from './supported_op_definition';

type DefAndName = AnyOpDef & {name: string}

function writeInternalOpInterpreter(supportedOps: DefAndName[]): string {
    return `

    struct Callstack<'a> {
        heap: Vec<InterpreterType>,
        ops: &'a Vec<Op>,
        restore_index: usize,
        stack: Vec<InterpreterType>
    }
    struct Context<'a> {
        heap: Vec<InterpreterType>,
        ops: &'a Vec<Op>,
        next_op_index: usize,
        stack: Vec<InterpreterType>
    }

    fn new_context(ops: &Vec<Op>, heap: Vec<InterpreterType>) -> Context {
        return Context {
            stack: vec![],
            next_op_index: 0,
            ops: ops,
            heap: heap
        }
    }

    async fn conduit_byte_code_interpreter_internal(
        input_heap: Vec<InterpreterType>, 
        ops: & Vec<Op>, 
        schemas: &Vec<Schema>, 
        db: Option<&mongodb::Database>, 
        stores: &HashMap<String, Schema>,
        fns: &HashMap<String, Vec<Op>>
    ) ->Result<InterpreterType, String> {        
        let mut dont_move_op_cursor = false;

        let mut current = new_context(ops, input_heap);
        let mut callstack: Vec<Context> = vec![];
        while current.next_op_index < current.ops.len() {
            let this_op = current.next_op_index;
            let err: Option<String> = match &current.ops[this_op] {
                ${supportedOps.map(o => {
                    let header = o.name
                    if ("paramType" in o) {
                        header = `${o.name}(${o.paramType.length === 1 ? "op_param" : o.paramType.map((v, i) => `param${i}`).join(", ")})`
                    }
                    return `Op::${header} => {
                        ${o.rustOpHandler}
                    }`
                }).join(",\n")}
            };
            if dont_move_op_cursor {
                dont_move_op_cursor = false;
            } else {
                current.next_op_index += 1;
            }
            
            match err {
                Some(v) => return Err(format!("error: {}", v)),
                _ => {}
            };
            if current.next_op_index >= current.ops.len() {
                match callstack.pop() {
                    Some(next) => {
                        current = next;
                        current.next_op_index += 1;
                    },
                    None => {}
                };
            }
        }
        
            
        
        return Ok(InterpreterType::None);
    }`
}

const rustSchemaTypeDefinition: Record<Exclude<SchemaType, PrimitiveUnion | "Any">, string> = {
    //Use vecs because it creates a layer of indirection allowing the type to be represented in rust.
    // Also, using vecs presents an opportunity to extend for union type support.
    // All these vecs should be of length 1.
    Optional: "Vec<Schema>",
    Object: "HashMap<String, Schema>",
    Array: "Vec<Schema>",
}

type InterpreterType = "None" | "Object" | "Array" | PrimitiveUnion


export type InterpreterTypeInstanceMap = {
    [T in InterpreterType]: T extends "None" ? null : 
    T extends "Object" ? Record<string, any> : 
    T extends "double" | "int" ? number:
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

    const supportedOps: DefAndName[] = []
    for (const key in OpSpec) {
        const d: DefAndName = {name: key, 
            //@ts-ignore
            ...OpSpec[key].opDefinition}
        
        supportedOps.push(d)            
    }

    return `
    #[derive(Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum Schema {
        ${[
            //@ts-ignore
            ...Object.keys(rustSchemaTypeDefinition).map(k => `${k}(${rustSchemaTypeDefinition[k]})`),
            ...Primitives,
            "Any"
        ].join(",\n")}
    }

    #[derive(Deserialize, Clone)]
    #[serde(tag = "kind", content= "data")]
    enum Op {
        ${supportedOps.map(o => {
            if ("paramType" in o) {
                return `${o.name}(${o.paramType.join(", ")})`
            }
            return o.name
        }).join(",\n")}
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    #[serde(untagged)]
    enum InterpreterType {
        ${//@ts-ignore
        Object.keys(interpreterTypeDef).map(k => `${k}${interpreterTypeDef[k] === null ? "" : `(${interpreterTypeDef[k]})`}`).join(",\n")}
    }

    ${writeInternalOpInterpreter(supportedOps)}

    async fn conduit_byte_code_interpreter(
        state: Vec<InterpreterType>, 
        ops: &Vec<Op>, 
        schemas: &Vec<Schema>, 
        db: Option<&mongodb::Database>, 
        stores: &HashMap<String, Schema>, 
        fns: &HashMap<String, Vec<Op>>) -> impl Responder {
        let output = conduit_byte_code_interpreter_internal(state, ops, schemas, db, stores, fns).await;
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

            Schema::Any => true,
            ${Primitives.map(p => {
                if (p === "double") {
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
export type AnyInterpreterTypeInstance = InterpreterTypeInstanceMap[keyof InterpreterTypeInstanceMap]
