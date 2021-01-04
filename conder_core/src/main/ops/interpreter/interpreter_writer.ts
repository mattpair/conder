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
    struct Execution<'a> {
        next_op_index: usize,
        ops: &'a Vec<Op>,
    }

    struct Context<'a> {
        heap: Vec<InterpreterType>,
        stack: Vec<InterpreterType>,
        locks: HashMap<String, locks::Mutex>,
        exec: Execution<'a>,
        // Optionals don't work. Vec is size 0 or 1.
        parent: Vec<Context<'a>>
    }

    enum ContextState<'a> {
        Continue(Context<'a>),
        Done(InterpreterType)
    }

    impl <'a> Context<'a>  {
        fn next_op(&self) -> &'a Op {
            &self.exec.ops[self.exec.next_op_index]
        }

        fn has_remaining_exec(&self) -> bool {
            self.exec.next_op_index < self.exec.ops.len()
        }
        fn advance(mut self) -> ContextState<'a> {
            self.exec.next_op_index += 1;
            if !self.has_remaining_exec() {
                return match self.parent.pop() {
                    Some(p) => p.advance(),
                    None => ContextState::Done(InterpreterType::None)
                };
            }
            return ContextState::Continue(self);
        }

        fn offset_cursor(&mut self, forward: bool, offset: usize) {
            if forward {
                self.exec.next_op_index += offset;
            } else {
                self.exec.next_op_index -= offset;
            }
        }
        async fn release_all_locks(&self, globals: &Globals<'a>) {
            for lock in self.locks.values() {
                match lock.release(globals.lm.unwrap()).await {
                    Ok(_) => {},
                    Err(e) => {
                        eprintln!("Failure cleaning up locks: {}", e);
                    }
                };
            }
        }

        async fn return_value(mut self, value: InterpreterType, globals: &Globals<'a>) -> ContextState<'a> {
            self.release_all_locks(globals).await;
            match self.parent.pop() {
                Some(mut parent) => {
                    parent.stack.push(value);
                    ContextState::Continue(parent)
                },
                None => ContextState::Done(value)
            }
        }
        async fn raise_error(self, globals: &Globals<'a>) {
            let mut maybe_node = Some(self);

            while let Some(mut this) = maybe_node {
                this.release_all_locks(globals).await;
                maybe_node = this.parent.pop();
            }

        }

        fn call(self, ops: &'a Vec<Op>, heap: Vec<InterpreterType>) -> Context<'a> {
            Context {
                stack: vec![],
                exec: Execution {
                    ops: ops,
                    next_op_index: 0
                },
                heap: heap,
                locks: HashMap::new(),
                parent: vec![self]
            }
        }
    }

    struct Globals<'a> {
        schemas: &'a Vec<Schema>, 
        db: Option<&'a mongodb::Database>, 
        stores: &'a HashMap<String, Schema>,
        fns: &'a HashMap<String, Vec<Op>>,
        lm: Option<&'a etcd_rs::Client>,
        private_key: &'a[u8; 64],
        public_key: &'a [u8; 32]
    }

    enum OpResult<'a> {
        Error(String, Context<'a>),
        Return{value: InterpreterType, from: Context<'a>},
        Continue(Context<'a>),
        Start(Context<'a>),
    }
    

    impl <'a> Op {
        async fn execute(&self, mut current: Context<'a>, globals: &'a Globals<'a>) -> OpResult<'a> {
            match self {${supportedOps.map(o => {
                let header = o.name
                if ("paramType" in o) {
                    header = `${o.name}(${o.paramType.length === 1 ? "op_param" : o.paramType.map((v, i) => `param${i}`).join(", ")})`
                }
                return `Op::${header} => {
                    ${o.rustOpHandler}
                }`
            }).join(",\n")}
            }            
        }
    }

    

    async fn conduit_byte_code_interpreter_internal(
        input_heap: Vec<InterpreterType>, 
        ops: & Vec<Op>, 
        globals: Globals<'_>
    ) ->Result<InterpreterType, String> {        
        
        if ops.len() == 0 {
            return Ok(InterpreterType::None);
        }
        let mut current = Context {
            stack: vec![],
            exec: Execution {
                ops: ops,
                next_op_index: 0
            },
            heap: input_heap,
            locks: HashMap::new(),
            parent: Vec::with_capacity(0)
        }; 
        loop {
            let res: OpResult = current.next_op().execute(current, &globals).await;

            let state = match res {
                OpResult::Return{from, value} => {
                    current = match from.return_value(value, &globals).await {
                        ContextState::Done(data) => return Ok(data),
                        ContextState::Continue(context) => context
                    };
                    current.advance()
                },
                OpResult::Error(msg, from) => {
                    // We know there are no error handlers at the moment.
                    from.raise_error(&globals).await;
                    return Err(msg.to_string());
                },
                OpResult::Continue(context) => context.advance(),
                OpResult::Start(new) => {
                    if !new.has_remaining_exec() {
                        new.advance()
                    } else {
                        ContextState::Continue(new)
                    }
                }
            };

            current = match state {
                ContextState::Continue(cont) => cont,
                ContextState::Done(data) => return Ok(data)
            };
        }        
    }`
}

const rustSchemaTypeDefinition: Record<Exclude<SchemaType, PrimitiveUnion | "Any" | "none">, string> = {
    //Use vecs because it creates a layer of indirection allowing the type to be represented in rust.
    // Also, using vecs presents an opportunity to extend for union type support.
    // All these vecs should be of length 1.
    Object: "HashMap<String, Schema>",
    Role: "String, Vec<Schema>",
    Array: "Vec<Schema>",
    Union: "Vec<Schema>"
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
            "Any",
            "none"
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

    impl Hash for InterpreterType {
        fn hash<H: Hasher>(&self, state: &mut H) {
            match self {
                InterpreterType::double(d) => {
                    state.write(b"d");
                    state.write_u64(d.to_bits());
                },
                InterpreterType::Object(o) => {
                    let mut sorted_keys: Vec<&String> = o.keys().collect();
                    sorted_keys.sort();
                    for k in sorted_keys {
                        state.write(k.as_bytes());
                        o.get(k).unwrap().hash(state);
                    }
                },
                InterpreterType::int(i) => {
                    state.write_i64(*i);
                },
                InterpreterType::bool(b) => {
                    state.write_u8(*b as u8);
                }
                InterpreterType::string(s) => {
                    state.write(s.as_bytes());
                },
                InterpreterType::Array(a) => {
                    for entry in a {
                        entry.hash(state);
                    }
                },
                InterpreterType::None => {
                }
            };

        }
    } 

    ${writeInternalOpInterpreter(supportedOps)}

    async fn conduit_byte_code_interpreter(
        state: Vec<InterpreterType>, 
        ops: &Vec<Op>,
        globals: Globals<'_>) -> impl Responder {
        let output = conduit_byte_code_interpreter_internal(state, ops, globals).await;
        return match output {
            Ok(data) => HttpResponse::Ok().json(data),
            Err(s) => {
                eprintln!("{}", s);
                HttpResponse::BadRequest().finish()
            }
        }
    }

    impl Schema {
        fn is_none(&self) -> bool {
            match self {
                Schema::none => true,
                _ => false
            }
        }

        fn is_optional(&self) -> bool {
            match self {
                Schema::Union(inner) => inner.into_iter().any(|o| o.is_none()),
                _ => false
            }
        }
    }


    fn adheres_to_schema(value: & InterpreterType, schema: &Schema, globs: &Globals) -> bool {
        return match schema {
            Schema::Union(options) => options.into_iter().any(|o| adheres_to_schema(value, o, globs)),
            Schema::Object(internal_schema) => match value {
                InterpreterType::Object(internal_value) => {
                    let mut optionals_missing = 0;
                    let mut adheres = true;
                    for (k, v_schema) in internal_schema {
                        adheres = match internal_value.get(k) {
                            Some(v_value) => adheres_to_schema(v_value, v_schema, globs),
                            None => {
                                if v_schema.is_optional() {
                                    optionals_missing += 1;
                                    true 
                                } else {
                                    false
                                }
                            }
                        };
                        if !adheres {
                            break
                        }
                    }
                    adheres && internal_schema.len() - optionals_missing >= internal_value.len()
                },
                _ => false
            },
            Schema::Array(internal) => match value {
                InterpreterType::Array(internal_value) => internal_value.iter().all(|val| adheres_to_schema(&val, &internal[0], globs)),
                _ => false
            },
            Schema::none => match value {
                InterpreterType::None => true,
                _ => false
            },
            
            Schema::Role(role_name, state_schema) => {
                let obj = match value {
                    InterpreterType::Object(o) => o,
                    _ => return false
                };
                let name = match obj.get("_name") {
                    Some(name_val) => match name_val {
                        InterpreterType::string(s) => s,
                        _ => return false
                    },
                    None => return false
                };
                let given_signature = match obj.get("_sig") {
                    Some(sig) => match sig {
                        InterpreterType::Array(a) => {
                            let mut results = Vec::with_capacity(a.len());
                            for i in a {
                                let u: u8 = match i {
                                    InterpreterType::int(_i) => match (*_i).try_into() {
                                        Ok(v) => v,
                                        Err(_) => {
                                            eprintln!("Failed to convert back to u8");
                                            return false;
                                        }
                                    },
                                    _ => return false
                                };
                                results.push(u);
                            }
                            results
                        },
                        _ => return false
                    },
                    None => return false
                };
                if given_signature.len() != 64 {
                    return false
                }
                let mut hasher = DefaultHasher::new();
                hasher.write(name.as_bytes());
                let check_state = match obj.get("_state") {
                    Some(state) => {
                        state.hash(&mut hasher);
                        Some(state)
                    },
                    None => None
                };
                let msg: [u8; 8] = hasher.finish().to_be_bytes();
                ed25519::verify(&msg, globs.public_key, given_signature.as_slice()) && match check_state {
                    Some(state) => adheres_to_schema(state, &state_schema[0], globs),
                    None => adheres_to_schema(&InterpreterType::Object(HashMap::with_capacity(0)), &state_schema[0], globs)
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
