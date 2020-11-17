import { AnyInterpreterTypeInstance } from "./interpreter_writer"
import * as mongodb from 'mongodb'
import { AnySchemaInstance } from "../SchemaFactory"
interface OpDef<NAME>  {
    readonly rustOpHandler: string
}
interface OpDefWithParameter<NAME> extends OpDef<NAME>  {readonly paramType: string[]}
export type AnyOpDef = OpDef<string> | OpDefWithParameter<string>

type StaticOp<KIND> = Op<KIND, "static", never>

type ParamOp<KIND, P> = {kind: KIND, class: "param", paramType: P}

type OpClass = "static" | "param" 
type Op<KIND, C extends OpClass, P=undefined> = 
{kind: KIND, class: C, paramType?: P}

type MongoBaseTypes = boolean | string | number
type ProjectionOptions = mongodb.SchemaMember<undefined,  MongoBaseTypes | MongoBaseTypes[] | mongodb.ProjectionOperators> 

type Ops = 
ParamOp<"returnVariable", number> |
StaticOp<"returnStackTop"> |
ParamOp<"copyFromHeap", number > |
ParamOp<"fieldAccess", string> |
ParamOp<"offsetOpCursor", number> |
ParamOp<"conditonallySkipXops", number>  |
StaticOp<"negatePrev"> |
StaticOp<"noop"> |
ParamOp<"truncateHeap", number> |
ParamOp<"enforceSchemaOnHeap", {heap_pos: number, schema: number}> |
ParamOp<"enforceSchemaInstanceOnHeap", {heap_pos: number, schema: AnySchemaInstance}> |
ParamOp<"insertFromHeap", {heap_pos: number, store: string}> |
ParamOp<"getAllFromStore", string> |
ParamOp<"insertFromStack", string> |
StaticOp<"moveStackTopToHeap"> |
ParamOp<"queryStore", [string, ProjectionOptions]> |
ParamOp<"findOneInStore", [string, ProjectionOptions]> |
ParamOp<"deleteOneInStore", string> |
ParamOp<"instantiate", AnyInterpreterTypeInstance> |
StaticOp<"popArray"> |
StaticOp<"toBool"> |
ParamOp<"moveStackToHeapArray", number> |
StaticOp<"arrayPush"> |
ParamOp<"assignPreviousToField", string> |
StaticOp<"arrayLen"> |
ParamOp<"storeLen", string> |
ParamOp<"createUpdateDoc", mongodb.UpdateQuery<{}>> |
ParamOp<"updateOne", {store: string, upsert: boolean}> |
ParamOp<"replaceOne", string> |
ParamOp<"setNestedField", string[]> |
ParamOp<"copyFieldFromHeap", {heap_pos: number, fields: string[]}> |
ParamOp<"extractFields", string[][]> | 
StaticOp<"equal"> |
StaticOp<"lesseq"> |
StaticOp<"less"> | 
StaticOp<"flattenArray"> |
StaticOp<"popStack"> |
StaticOp<"boolAnd"> |
StaticOp<"boolOr"> |
ParamOp<"raiseError", string> | 
ParamOp<"assertHeapLen", number> |
ParamOp<"setField", {field_depth: number}> | 
ParamOp<"getField", {field_depth: number}> |
StaticOp<"fieldExists"> | 
ParamOp<"overwriteHeap", number> |
ParamOp<"tryGetField", string> | 
StaticOp<"isLastNone"> |
ParamOp<"stringConcat", {nStrings: number, joiner: string}> | 
StaticOp<"nPlus"> |
StaticOp<"nMinus">


type ParamFactory<P, S> = (p: P) => OpInstance<S>

type OpProducer<C extends Ops> = C["class"] extends "static" ? OpInstance<C["kind"]> : 
C["class"] extends "param" ? ParamFactory<C["paramType"], C["kind"]> :
never

type OpFactoryFinder<C extends Ops> = C["class"] extends "static" ? {} : 
C["class"] extends "param" ? {factoryMethod: ParamFactory<C["paramType"], C["kind"]>} :
never

export type CompleteOpFactory = {
    readonly [P in Ops["kind"]]: OpFactoryFinder<Extract<Ops, {kind: P}>>
};

type OpDefFinder<C extends Ops> = C["class"] extends "static" ? OpDef<C["kind"]>: 
C["class"] extends "param" ? OpDefWithParameter<C["kind"]> :
never

export type OpSpec<P extends Ops["kind"]> = Readonly<{
    opDefinition: OpDefFinder<Extract<Ops, {kind: P}>>
} & OpFactoryFinder<Extract<Ops, {kind: P}>>>

export type CompleteOpSpec = {
    readonly [P in Ops["kind"]]: OpSpec<P>
}

export type CompleteOpWriter = {
    readonly [P in Ops["kind"]]: OpProducer<Extract<Ops, {kind: P}>>
}

export type OpInstance<S=string> = Readonly<{
    // These fields are based on the Interpreter writer's op field.
    kind: S
    data: any
}>
export type AnyOpInstance = OpInstance<Ops["kind"]>

function raiseErrorWithMessage(s: string): string {
    return `Some("${s}".to_string())`
}

const getDb = `db.unwrap()`

const popStack = `
    match stack.pop() {
        Some(v) => v,
        _ => panic!("Attempting to access non existent value")
    }
    `
const popToBool = `match ${popStack} {
    InterpreterType::bool(s) => s, 
    _ => panic!("Stack variable is not a bool")
}
`

const popToString = `
    match ${popStack} {
        InterpreterType::string(s) => s, 
        _ => panic!("Stack variable is not a string")
    }`
const popToObject = `
    match ${popStack} {
        InterpreterType::Object(o) => o,
        _ => panic!("stack variable is not an object")
    }
`
const lastStack = `stack.last_mut().unwrap()`

function safeGoto(varname: string): string {
    return `
    if ${varname} >= ops.len() {
        panic!("Setting op index out of bounds");
    }
    next_op_index = ${varname};
    None
    `
}
function pushStack(instance: string): string {
    return `stack.push(${instance})`
}

function applyAgainstNumbers(n1: string, n2: string, op: string, type: "number" | "bool"): string {
    const toType = (value: string, di: "double" | "int") => {
        if (type === "number") {
            return `InterpreterType::${di}(${value})`
        } else {
            return `InterpreterType::bool(${value})`
        }
    }

    return ` 
        match ${n1} {
            InterpreterType::int(i1) => match ${n2} {
                InterpreterType::int(i2) => ${toType(`i1 ${op} i2`, "int")},
                InterpreterType::double(d2) => ${toType(`(i1 as f64) ${op} d2`, "double")},
                _ => panic!("not a number")
            },
            InterpreterType::double(d1) => match ${n2} {
                InterpreterType::int(i2) => ${toType(`d1 ${op} (i2 as f64)`, "double")},
                InterpreterType::double(d2) => ${toType(`d1 ${op} d2`, "double")},
                _ => panic!("not a number")
            }, 
            _ => panic!("not a number")
        }`
}

export const OpSpec: CompleteOpSpec = {
    negatePrev: {
        opDefinition: {
            rustOpHandler: `match ${popStack} {
                InterpreterType::bool(b) =>  {${pushStack("InterpreterType::bool(!b)")}; None},
                _ => ${raiseErrorWithMessage("Negating a non boolean value")}
            }`
        },
    },

    isLastNone: {
        opDefinition: {
            rustOpHandler: `
            let res = match ${lastStack} {
                InterpreterType::None => true,
                _ => false
            };
            ${pushStack("InterpreterType::bool(res)")};
            None
            `
        }
    },
    tryGetField: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            match ${popStack} {
                InterpreterType::Object(mut o) => match o.remove(op_param) {
                    Some(f) => {
                        ${pushStack("f")};
                        None
                    },
                    None => {
                        ${pushStack("InterpreterType::None")};
                        None
                    }
                },
                _ =>${raiseErrorWithMessage("Not an object")}
            }
            `
        },
        factoryMethod: (data) => ({kind: "tryGetField", data})
    },
    overwriteHeap: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: `
            heap[*op_param] = ${popStack};
            None
            `
        },
        factoryMethod: (data) => ({kind: "overwriteHeap", data})
    },
    raiseError: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            Some(op_param.to_string())
            `
        },
        factoryMethod: (data) => ({kind: 'raiseError', data})
    },
    noop: {
        opDefinition: {
            rustOpHandler: ` None`
        },
    },

    setField: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: `
            let setTo = ${popStack};
            let mut fields = Vec::with_capacity(*op_param);
            for n in 1..=*op_param {
                fields.push(${popToString});
            }
            let mut original = ${popToObject};

            let mut target = &mut original;
            while fields.len() > 1 {
                target = match target.get_mut(&fields.pop().unwrap()).unwrap() {
                    InterpreterType::Object(obj) => obj,
                    _ => panic!("not an object")
                };
            }
            target.insert(fields.pop().unwrap(), setTo);
            ${pushStack("InterpreterType::Object(original)")};
            None
            `
        },
        factoryMethod: ({field_depth}) => ({kind: "setField", data: field_depth})
    },

    stringConcat: {
        opDefinition: {
            paramType: ["usize", "String"],
            rustOpHandler: `
            let mut strings = Vec::with_capacity(*param0);
            for n in 1..=*param0 {
                strings.push(${popToString});
            }
            strings.reverse();
            ${pushStack("InterpreterType::string(strings.join(param1))")};
            None
            `
        },
        factoryMethod: (p) => ({kind: "stringConcat", data: [p.nStrings, p.joiner]})
    },

    getField: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: `
            let mut fields = Vec::with_capacity(*op_param);
            for n in 1..=*op_param {
                fields.push(${popToString});
            }
            let mut object = ${popToObject};

            while fields.len() > 1 {
                object = match object.remove(&fields.pop().unwrap()).unwrap() {
                    InterpreterType::Object(obj) => obj,
                    _ => panic!("not an object")
                };
            }

            ${pushStack(`match object.remove(&fields.pop().unwrap()) {
                Some(o) => o,
                None => InterpreterType::None
            }`)};
            None
            `
        },
        factoryMethod: ({field_depth}) => ({kind: "getField", data: field_depth})
    },

    fieldExists: {
        opDefinition: {
            rustOpHandler: `
            let field = ${popToString};
            let obj = ${popToObject};
            ${pushStack(`InterpreterType::bool(match obj.get(&field) {
                Some(d) => match d {
                    InterpreterType::None => false,
                    _ => true
                },
                None => false
            })`)};
            None
            `
        }
    },

    truncateHeap: {
        opDefinition: {
            rustOpHandler: `heap.truncate(heap.len() - *op_param);  None`,
            paramType: ["usize"]
        },
        factoryMethod: (p) => ({kind: "truncateHeap", data: p})
    },

    offsetOpCursor: {
        opDefinition: {
            
            rustOpHandler: safeGoto("*op_param + next_op_index"),
            paramType: ["usize"]
        },
        // here if p == -2    
        // here if p == -1
        // start <--- this op, the offset.
        // here if p == 0
        // here if p == 1
        factoryMethod: (p) => ({kind: "offsetOpCursor", data: p < 0 ? p - 1 : p})
    },

    conditonallySkipXops: {
        opDefinition: {
            rustOpHandler: `
                match ${popStack} {
                    InterpreterType::bool(b) => {
                        if b {
                            ${safeGoto("*op_param + next_op_index")}
                        } else {
                            None
                        }
                    },
                    _ => ${raiseErrorWithMessage("Cannot evaluate variable as boolean")}
                }
            `,
            paramType: ["usize"]
        },
        // here if p == -2    
        // here if p == -1
        // start <--- this op, the conditional skip.
        // here if p == 0
        // here if p == 1
        factoryMethod: (p) => ({kind: "conditonallySkipXops", data: p < 0 ? p - 1 : p})
    },


    returnVariable: {
        factoryMethod(varname: number) {
            return {
                kind: "returnVariable",
                data: varname
            }
        },
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: ` return Ok(heap.swap_remove(*op_param))`
        }
    },

    returnStackTop: {
        opDefinition: {
            rustOpHandler: `return Ok(${popStack})`
        }
    },
    
    copyFromHeap:{
        factoryMethod(n: number) {
            return {
                kind: "copyFromHeap",
                data: n
            }
        },
        opDefinition: {                    
            paramType: ["usize"],
            rustOpHandler: `match heap.get(*op_param) {
                Some(d) => {${pushStack("d.clone()")}; None},
                None => ${raiseErrorWithMessage("Echoing variable that does not exist")}
            }`
        }
    },
    fieldAccess: {
        factoryMethod(fieldname: string) {
            return {kind: `fieldAccess`, data: fieldname}
        },
        opDefinition: {
            paramType: [`String`],
            rustOpHandler: `
                    let res = match ${popStack} {
                        InterpreterType::Object(inside) => match inside.get(op_param) {
                            Some(o) =>  Ok(o.clone()),
                            _ => Err("Field does not exist")
                        },
                        _ => Err("Attempting to reference a field that doesn't exist on current type")
                    };

                    match res {
                        Ok(d) => {${pushStack("d")}; None},
                        Err(e) => Some(e.to_string())
                    }
                        
            `
        }
    },   
    enforceSchemaOnHeap: {
        opDefinition: {
            paramType: ["usize", "usize"],
            rustOpHandler: `
            ${pushStack("InterpreterType::bool(adheres_to_schema(&heap[*param1], &schemas[*param0]))")};
            None`,
        },
        factoryMethod: (p) => ({kind: "enforceSchemaOnHeap", data: [p.schema, p.heap_pos]})
    },
    insertFromHeap: {
        opDefinition: {
            paramType: ["usize", "String"],
            rustOpHandler: `
            match storage::append(${getDb}, &param1, &heap[*param0]).await {
                InterpreterType::None => None,
                _ => ${raiseErrorWithMessage("unexpected return result")}
            }
            `
        },
        factoryMethod: (v) => ({kind: "insertFromHeap", data: [v.heap_pos, v.store]})
    },

    insertFromStack: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let insert_elt = ${popStack};
            match storage::append(${getDb}, op_param, &insert_elt).await {
                InterpreterType::None => None,
                _ => ${raiseErrorWithMessage("unexpected return result")}
            }
            `
        },
        factoryMethod: (v) => ({kind: "insertFromStack", data: v})
    },

    getAllFromStore: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let res = storage::query(${getDb}, op_param, &HashMap::new(), &HashMap::new()).await;
            ${pushStack(`res`)};
            None
            `
        },
        factoryMethod: (s) => ({kind: "getAllFromStore", data: s})
    },
    moveStackTopToHeap: {
        opDefinition: {
            rustOpHandler: `
            heap.push(${popStack});
            None
            `
        },
    },
    queryStore: {
        opDefinition: {
            paramType: ["String", "HashMap<String, InterpreterType>"],
            rustOpHandler: `
            let res = storage::query(${getDb}, &param0, &param1, &${popToObject}).await;
            ${pushStack("res")};
            None
            `
        },
        factoryMethod: (p) => ({
            kind: "queryStore",
            data: p
        })
    },
    findOneInStore: {
        opDefinition: {
            paramType: ["String", "HashMap<String, InterpreterType>"],
            rustOpHandler: `
            let res = storage::find_one(${getDb}, &param0, &param1, &${popToObject}).await;
            ${pushStack("res")};
            None
            `
        },
        factoryMethod: (d) => ({kind: "findOneInStore", data: d})
    },
    deleteOneInStore: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let res = storage::delete_one(${getDb}, op_param, &${popStack}).await;
            ${pushStack("res")};
            None
            `
        },
        factoryMethod: (data) => ({kind: "deleteOneInStore", data})
    },
    popStack: {
        opDefinition: {
            rustOpHandler: `
            ${popStack};
            None
            `
        }
    },

    instantiate: {
        opDefinition: {
            paramType: ["InterpreterType"],
            
            rustOpHandler: `
            ${pushStack("op_param.clone()")};
            None
            `
        },
        factoryMethod: (data) => ({kind: "instantiate", data})
    },
    popArray: {
        opDefinition: {

            rustOpHandler: `
            let res = match ${lastStack} {
                InterpreterType::Array(inner) => match inner.pop() {
                    Some(v) => v,
                    None => InterpreterType::None
                },
                _ => panic!("Cannot pop from non-array")
            };
            ${pushStack("res")};
            None
            `
        },
    },
    flattenArray: {
        opDefinition: {
            rustOpHandler: `
            let mut res = match ${popStack} {
                InterpreterType::Array(inner) => inner,
                _ => panic!("Cannot flatten non array")
            };
            res.reverse();
            stack.append(&mut res);
            None
            `
        }
    },
    toBool: {
        opDefinition: {
            
            rustOpHandler: `
            let val = match &${lastStack} {
                InterpreterType::None => InterpreterType::bool(false),
                _ => InterpreterType::bool(true)
            };
            ${pushStack("val")};
            None
            `
        },
    },
    moveStackToHeapArray: {
        opDefinition: {
            
            paramType: ["usize"],
            rustOpHandler: `
            let p = ${popStack};
            match heap.get_mut(*op_param).unwrap() {
                InterpreterType::Array(inner) => {
                    inner.push(p);
                    None
                }, 
                _ => ${raiseErrorWithMessage("Cannot push to a non array variable")}
            }
            `
        },
        factoryMethod: (data) => ({kind: "moveStackToHeapArray", data})   
    }, 
    arrayPush: {
        opDefinition: {     
            rustOpHandler: `
            let pushme = ${popStack};
            match ${lastStack} {
                InterpreterType::Array(inner) => {
                    inner.push(pushme);
                    None
                },
                _ => ${raiseErrorWithMessage("Cannot push on non array")}
            }
            `
        },
    },

    assignPreviousToField: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let value = ${popStack};
            match ${lastStack} {
                InterpreterType::Object(m) => {
                    m.insert(op_param.to_string(), value);
                    None
                },
                _ => ${raiseErrorWithMessage("Cannot add a field to a non-object")}
            }
            `
        },
        factoryMethod: (data) => ({kind: "assignPreviousToField", data})
    },

    arrayLen: {
        opDefinition: {
            rustOpHandler: `
            match ${popStack} {
                InterpreterType::Array(a) => {${pushStack("InterpreterType::int(i64::try_from(a.len()).unwrap())")}; None},
                _ => ${raiseErrorWithMessage("Cannot take len of non array object")}
            }
            `
        }
    },
    storeLen: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let filter = ${popToObject};
            ${pushStack(`storage::measure(${getDb}, op_param, &filter).await`)};
            None
            `
        },
        factoryMethod: (data) => ({kind: "storeLen", data})
    },

    createUpdateDoc: {
        opDefinition: {
            paramType: ["InterpreterType"],
            rustOpHandler: `
            ${pushStack("op_param.clone()")};
            None
            `
        },
        factoryMethod: (data) => ({kind: "createUpdateDoc", data})
    },

    updateOne: {
        opDefinition: {
            paramType: ["String", "bool"],
            rustOpHandler: `
            let query_doc = ${popStack};
            let update_doc =  ${popStack};
            ${pushStack(`storage::find_and_update_one(${getDb}, param0, *param1, &query_doc, &update_doc).await`)};
            None
            `
        },
        factoryMethod: (p) => ({kind: "updateOne", data: [p.store, p.upsert]})
    },

    replaceOne: {
        opDefinition: {
            paramType: ["String", "bool"],
            rustOpHandler: `
            let query_doc = ${popToObject};
            let update_doc =  ${popToObject};
            ${pushStack(`InterpreterType::bool(storage::replace_one(${getDb}, param0, &query_doc, &update_doc, *param1).await)`)};
            None
            `
        },
        factoryMethod: (p) => ({kind: "replaceOne", data: p})
    },

    setNestedField: {
        opDefinition: {
            paramType: ["Vec<String>"],
            rustOpHandler: `
            let data = ${popStack};
            let mut target = ${lastStack};
            let (last_field, earlier_fields) = op_param.split_last().unwrap();
            for f in earlier_fields {
                match target {
                    InterpreterType::Object(inner) => {
                        target = inner.get_mut(f).unwrap();
                    },
                    _ => panic!("Invalid field access")
                }
            }
            
            match target {
                InterpreterType::Object(inner) => {
                    inner.insert(last_field.to_string(), data);
                    None
                }
                _ => panic!("Cannot set field on non object")
            }
            `
        },
        factoryMethod: (data) => {
            if (data.length <= 1) {
                throw Error(`nested field must be more than one level deep.`)
            }
            return {kind: "setNestedField", data}
        }
    },
    copyFieldFromHeap: {
        opDefinition: {
            paramType: ["usize", "Vec<String>"],
            rustOpHandler: `
            let mut target: &InterpreterType = &heap[*param0];
            for f in param1 {
                target = match target {
                    InterpreterType::Object(inner) => match inner.get(f) {
                        Some(v) => v,
                        None => panic!("Field does not exist: {}", f)
                    }
                    _ => panic!("Accessing field on non object")
                };
            }

            ${pushStack("target.clone()")};
            None
            `
        },
        factoryMethod: (input) => ({kind: "copyFieldFromHeap", data: [input.heap_pos, input.fields]})
    },

    enforceSchemaInstanceOnHeap: {
        opDefinition: {
            paramType: ["usize", "Schema"],
            rustOpHandler: `
            ${pushStack("InterpreterType::bool(adheres_to_schema(&heap[*param0], param1))")};
            None
            `
        },
        factoryMethod: (p) => ({kind: "enforceSchemaInstanceOnHeap", data: [p.heap_pos, p.schema]})
    },

    extractFields: {
        opDefinition: {
            paramType: ["Vec<Vec<String>>"],
            rustOpHandler: `
            let mut original_object = match ${popStack} {
                InterpreterType::Object(o) => o,
                _ => panic!("Unexpected non object")
            };
            for selector in op_param {
                let (first, rest) = selector.split_first().unwrap();
                let mut obj = original_object.remove(first).unwrap();
                for field in rest {
                    obj = match obj {
                        InterpreterType::Object(mut o) => o.remove(field).unwrap(),
                        _ => panic!("Unexpected non object")
                    };
                }
                ${pushStack("obj")};
            }
            None
            `
        },
        factoryMethod: (data) => ({kind: "extractFields", data})
    },
    equal: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popStack};
            let second = ${popStack};
            ${pushStack(`InterpreterType::bool(match first {
                InterpreterType::string(fs) => match second {
                    InterpreterType::string(ss) => fs == ss,
                    _ => false
                },
            
                InterpreterType::int(fi) => match second {
                    InterpreterType::int(si) => fi == si,
                    _ => false
                },

                InterpreterType::double(fd) => match second {
                    InterpreterType::double(sd) => fd == sd,
                    _ => false
                },

                _ => false
            })`)};
            None
            `
        }
    },
    less: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popStack};
            let second = ${popStack};
            ${pushStack(applyAgainstNumbers("first", "second", "<", "bool"))};
            None
            `
        }
    },
    lesseq: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popStack};
            let second = ${popStack};
            ${pushStack(applyAgainstNumbers("first", "second", "<=", "bool"))};
            None
            
            `
        }
    },
    boolAnd: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popToBool};
            let second = ${popToBool};
            ${pushStack("InterpreterType::bool(first && second)")};
            None
            `
        }
    },
    boolOr: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popToBool};
            let second = ${popToBool};
            ${pushStack("InterpreterType::bool(first || second)")};
            None
            `
        }
    },
    assertHeapLen: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: `
            if heap.len() != *op_param {
                ${raiseErrorWithMessage("unexpected heap len")}
            } else {
                None
            }
            `
        },
        factoryMethod: (data) => ({kind: "assertHeapLen", data})
    },

    nPlus: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popStack};
            let second = ${popStack};
            ${pushStack(applyAgainstNumbers("first", "second", "+", "number"))};
            None
            `
        }
    },
    nMinus: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popStack};
            let second = ${popStack};
            ${pushStack(applyAgainstNumbers("first", "second", "-", "number"))};
            None
            `
        }
    }
}
