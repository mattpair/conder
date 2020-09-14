import { Lexicon } from 'conduit_parser';
import { AnyOpDef, OpSpec } from './supported_op_definition';


function writeInternalOpInterpreter(supportedOps: AnyOpDef[]): string {
    return `
    async fn conduit_byte_code_interpreter_internal(mut heap: Vec<InterpreterType>, ops: & Vec<Op>, schemas: &Vec<Schema>) ->Result<InterpreterType, String> {
        let mut stack: Vec<InterpreterType> = vec![];
        let mut next_op_index = 0;
        while next_op_index < ops.len() {

            let err: Option<String> = match &ops[next_op_index] {
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
                Some(v) => return Err(format!("error: {}", v)),
                _ => {}
            };
        }
        
            
        
        return Ok(InterpreterType::None);
    }`
}

export type SchemaType = "Optional" | "Object" | "Array" | Lexicon.PrimitiveUnion
const rustSchemaTypeDefinition: Record<Exclude<SchemaType, Lexicon.PrimitiveUnion>, string> = {
    //Use vecs because it creates a layer of indirection allowing the type to be represented in rust.
    // Also, using vecs presents an opportunity to extend for union type support.
    // All these vecs should be of length 1.
    Optional: "Vec<Schema>",
    Object: "HashMap<String, Schema>",
    Array: "Vec<Schema>",    
}

type SchemaFactory = Readonly<{
    [P in Exclude<SchemaType, Lexicon.PrimitiveUnion>]: 
        P extends "Object" ? (r: Record<string, SchemaInstance<SchemaType>>) =>  SchemaInstance<P> :
        (i: SchemaInstance<SchemaType>) => SchemaInstance<P>
} & {primitive: (p: Lexicon.PrimitiveUnion) => SchemaInstance<Lexicon.PrimitiveUnion>}>


export const schemaFactory: SchemaFactory = {
    Object: (r) => ({kind: "Object", data: r}),
    Array: (r) => ({kind: "Array", data: [r]}),
    Optional: (r) => ({kind: "Optional", data: [r]}),
    primitive: (p) => ({kind: p})
}

export type SchemaInstance<P extends SchemaType> = P extends Lexicon.PrimitiveUnion ? {kind: P} :
P extends "Object" ? {kind: "Object", data: Record<string, SchemaInstance<SchemaType>>} :
P extends "Optional" ? {kind: "Optional", data: [SchemaInstance<SchemaType>]} :
P extends "Array" ? {kind: "Array", data: [SchemaInstance<SchemaType>]} : never



type InterpreterType = "None" | "Object" | "Array" | Lexicon.PrimitiveUnion


export type InterpreterTypeInstanceMap = {
    [T in InterpreterType]: T extends "None" ? null : 
    T extends "Object" ? Record<string, any> : 
    T extends Lexicon.Symbol.decimal ? [number, number]:
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
    decimal: (d) => {
        if (Math.round(d[0]) !== d[0] || Math.round(d[1]) !== d[1]) {
            throw Error(`Decimal tuple members must be integers`)
        }
        if (d[1] < 0) {
            throw Error(`Decimal value must not be negative`)
        }
        return d
    },
    int: (d) => {
        if (Math.round(d) !== d) {
            throw Error(`Integers must not contain decimals`)
        }
        return d
    },
    string: (s) => s,
    bytes: (b) => b,
    bool: (b) => b,
    Array: (a) => a
}

const interpreterTypeDef: RustInterpreterTypeEnumDefinition = {
    decimal: ["i64", "i64"],
    int: ["i64"],
    bool: ["bool"],
    string: ["String"],
    bytes: ["Vec<u8>"],
    None: null,
    Array: ["Vec<InterpreterType>"],
    Object: ["HashMap<String, InterpreterType>"]
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
            //@ts-ignore
            ...Object.keys(rustSchemaTypeDefinition).map(k => `${k}(${rustSchemaTypeDefinition[k]})`),
            ...Lexicon.Primitives
        ].join(",\n")}
    }

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
    #[serde(untagged)]
    enum InterpreterType {
        ${//@ts-ignore
        Object.keys(interpreterTypeDef).map(k => `${k}${interpreterTypeDef[k] === null ? "" : `(${interpreterTypeDef[k]})`}`).join(",\n")}
    }

    ${writeInternalOpInterpreter(supportedOps)}

    async fn conduit_byte_code_interpreter(state: Vec<InterpreterType>, ops: &Vec<Op>, schemas: &Vec<Schema>) -> impl Responder {
        let output = conduit_byte_code_interpreter_internal(state, ops, schemas).await;
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
            Schema::Optional(internal) => match value {
                InterpreterType::None => true,
                _ => adheres_to_schema(value, &internal[0])
            },
            ${Lexicon.Primitives.map(p => `Schema::${p} => {
                match value {
                    InterpreterType::${p}(${interpreterTypeDef[p].map(_ => `_`).join(", ")}) => true,
                    _ => false
                }
            }`).join(",\n")}
        }
    }
    `
}