import { SchemaInstance } from './../SchemaFactory';
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
StaticOp<"returnVoid"> |
ParamOp<"copyFromHeap", number > |
ParamOp<"fieldAccess", string> |
ParamOp<"offsetOpCursor", {offset: number, direction: "fwd" | "bwd"}> |
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
ParamOp<"pArrayPush", {stack_offset: number}> |
ParamOp<"assignPreviousToField", string> |
StaticOp<"arrayLen"> |
StaticOp<"ndArrayLen"> |
ParamOp<"storeLen", string> |
ParamOp<"createUpdateDoc", mongodb.UpdateQuery<{}>> |
ParamOp<"updateOne", {store: string, upsert: boolean}> |
ParamOp<"replaceOne", {store: string, upsert: boolean}> |
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
ParamOp<"setSavedField", {field_depth: number, index: number}> | 
ParamOp<"getField", {field_depth: number}> |
ParamOp<"getSavedField", {field_depth: number, index: number}> |
ParamOp<"deleteSavedField", {field_depth: number, index: number}> |
ParamOp<"pushSavedField", {field_depth: number, index: number}> |
StaticOp<"fieldExists"> | 
ParamOp<"overwriteHeap", number> |
ParamOp<"tryGetField", string> | 
StaticOp<"isLastNone"> |
ParamOp<"stringConcat", {nStrings: number, joiner: string}> | 
StaticOp<"plus"> |
StaticOp<"nMinus"> |
StaticOp<"nDivide"> |
StaticOp<"nMult"> |
StaticOp<"getKeys"> |
StaticOp<"repackageCollection"> |
ParamOp<"invoke", {name: string, args: number}> |
StaticOp<"lock"> |
StaticOp<"release"> |
StaticOp<"signRole"> |
StaticOp<"getType">

const unwrap_or_error:(value: string) => string = (val) => `
    match ${val} {
    Some(__v) => __v,
    None => {
        let base = r#"Val does not exist ${val}"#;
        let msg = format!("{}", base);
        return OpResult::Error(msg, current);
    }
    }`


const get_or_err:(value: string) => string = (val) => `

    match ${val} {
        Ok(__v) => __v,
        Err(e) => {
            let base = r#"Error getting ${val}:"#;
            let msg = format!("{} {}", base, e);
            return OpResult::Error(msg, current);
        }
    }`


// ParamOp<"registerContextMgr", {do: AnyOpInstance[], onClose: AnyOpInstance[]}>

// stack top -> anything you want to pull off in at start
//              fields
//              target entity if against stack
function againstField(
    action: "get" | "overwrite" | "delete" | "push",
    data: {depth: string, location: {save: string} | "stack"}): string {
    
    const mut = action === "get" ? "" : "_mut"
    
    let atStart: string = ''
    let withLastField: string = ""
    switch (action) {
        case "get":
            withLastField = `
            let push = match o_or_a {
                InterpreterType::Object(o) => match last_field {
                    InterpreterType::string(s) => match o.get${mut}(&s) {
                        Some(val) => val.clone(),
                        None => InterpreterType::None 
                    },
                    _ => ${raiseErrorWithMessage("Cannot index object with this type")}
                },
                InterpreterType::Array(a) => match last_field {
                    InterpreterType::int(i) => ${unwrap_or_error(`a.get${mut}(i as usize)`)},
                    InterpreterType::double(d) => ${unwrap_or_error(`a.get${mut}(d as usize)`)},
                    _ => ${raiseErrorWithMessage("Cannot index array with type")}
                }.clone(),
                _ => ${raiseErrorWithMessage("cannot index into type")}   
            };
            ${data.location === "stack" ? popStack : ""};
            ${pushStack(`push`)};
            `
            break
        case "overwrite":
            atStart = `let set_to = ${popStack};`
            withLastField = `
            match o_or_a {
                InterpreterType::Object(o) => match last_field {
                    InterpreterType::string(s) => o.insert(s, set_to),
                    _ => ${raiseErrorWithMessage("Cannot index object with this type")}
                },
                _ => ${raiseErrorWithMessage("cannot overwrite type")}
            };
            `
            break
        case "delete":
            withLastField = `
            match o_or_a {
                InterpreterType::Object(o) => match last_field {
                    InterpreterType::string(s) => o.remove(&s),
                    _ => ${raiseErrorWithMessage("Cannot index object with this type")}
                },
                _ => ${raiseErrorWithMessage("cannot delete type")}   
            };
            `
            break
        case "push":
            atStart = `let mut push = ${popToArray};`
            withLastField = `
            let arr = match o_or_a {
                InterpreterType::Object(o) => match last_field {
                    InterpreterType::string(s) => ${unwrap_or_error(`o.get${mut}(&s)`)},
                    _ => ${raiseErrorWithMessage("Cannot index object with this type")}
                },
                InterpreterType::Array(a) => match last_field {
                    InterpreterType::int(i) => ${unwrap_or_error(`a.get${mut}(i as usize)`)},
                    InterpreterType::double(d) => ${unwrap_or_error(`a.get${mut}(d as usize)`)},
                    _ => ${raiseErrorWithMessage("Cannot index array with type")}
                },
                _ => ${raiseErrorWithMessage("cannot index into type")}
            };
            match arr {
                InterpreterType::Array(a) => a.append(&mut push),
                _ => ${raiseErrorWithMessage("expected array")}
            };
            `
            break
    }

    return `
            ${atStart}
            let mut fields = current.stack.split_off(current.stack.len() - ${data.depth});
            let last_field = ${unwrap_or_error(`fields.pop()`)};
    
            let mut o_or_a = ${data.location === "stack" ? unwrap_or_error(`current.stack.last${mut}()`) : unwrap_or_error(`current.heap.get${mut}(${data.location.save})`)};
            for f in fields {
                o_or_a = match o_or_a {
                    InterpreterType::Object(o) => match f {
                        InterpreterType::string(s) => ${unwrap_or_error(`o.get${mut}(&s)`)},
                        _ => ${raiseErrorWithMessage("Cannot index object with this type")}
                    },
                    InterpreterType::Array(a) => match f {
                        InterpreterType::int(i) => ${unwrap_or_error(`a.get${mut}(i as usize)`)},
                        InterpreterType::double(d) => ${unwrap_or_error(`a.get${mut}(d as usize)`)},
                        _ => ${raiseErrorWithMessage("Cannot index array with type")}
                    },
                    _ => ${raiseErrorWithMessage("cannot index into type")}
                };
            }
            ${withLastField}
            
            OpResult::Continue(current)`
}

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

function raiseErrorWithMessage(s: string, ...formatArgs: string[]): string {
    const formatting: string = formatArgs.length > 0 ? "," + formatArgs.join(", ") : ""
    return `return OpResult::Error(format!("${s}"${formatting}), current)`
}

const getDb = `${unwrap_or_error(`globals.db`)}`

const popStack = `
    match current.stack.pop() {
        Some(v) => v,
        _ => ${raiseErrorWithMessage("Attempting to access non existent value")}
    }
    `
const popToBool = `match ${popStack} {
    InterpreterType::bool(s) => s, 
    _ => ${raiseErrorWithMessage("Stack variable is not a bool")}
}
`
const popToArray = `match ${popStack} {
    InterpreterType::Array(a) => a,
    _ => ${raiseErrorWithMessage("Expected an array")}
}
`

const popToString = `
    match ${popStack} {
        InterpreterType::string(s) => s, 
        _ => ${raiseErrorWithMessage("Stack variable is not a string")}
    }`
const popToObject = `
    match ${popStack} {
        InterpreterType::Object(o) => o,
        _ => ${raiseErrorWithMessage("stack variable is not an object")}
    }
`
const lastStack = `${unwrap_or_error(`current.stack.last_mut()`)}`

function pushStack(instance: string): string {
    return `current.stack.push(${instance})`
}

function applyAgainstNumbers(left: string, right: string, op: string, type: "number" | "bool"): string {
    const toType = (value: string, di: "double" | "int") => {
        if (type === "number") {
            return `InterpreterType::${di}(${value})`
        } else {
            return `InterpreterType::bool(${value})`
        }
    }

    return ` 
        match ${left} {
            InterpreterType::int(i1) => match ${right} {
                InterpreterType::int(i2) => ${toType(`i1 ${op} i2`, "int")},
                InterpreterType::double(d2) => ${toType(`(i1 as f64) ${op} d2`, "double")},
                _ => ${raiseErrorWithMessage("not a number")}
            },
            InterpreterType::double(d1) => match ${right} {
                InterpreterType::int(i2) => ${toType(`d1 ${op} (i2 as f64)`, "double")},
                InterpreterType::double(d2) => ${toType(`d1 ${op} d2`, "double")},
                _ => ${raiseErrorWithMessage("not a number")}
            }, 
            _ => ${raiseErrorWithMessage("not a number")}
        }`
}

export const OpSpec: CompleteOpSpec = {
    negatePrev: {
        opDefinition: {
            rustOpHandler: `match ${popStack} {
                InterpreterType::bool(b) =>  {${pushStack("InterpreterType::bool(!b)")}; OpResult::Continue(current)},
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
            OpResult::Continue(current)
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
                        OpResult::Continue(current)
                    },
                    None => {
                        ${pushStack("InterpreterType::None")};
                        OpResult::Continue(current)
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
            if current.heap.len() <= *op_param {
                ${raiseErrorWithMessage("overwriting non existent heap variable")};
            } 
            current.heap[*op_param] = ${popStack};
            OpResult::Continue(current)
            `
        },
        factoryMethod: (data) => ({kind: "overwriteHeap", data})
    },
    raiseError: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            OpResult::Error(op_param.to_string(), current)
            `
        },
        factoryMethod: (data) => ({kind: 'raiseError', data})
    },
    noop: {
        opDefinition: {
            rustOpHandler: ` OpResult::Continue(current)`
        },
    },

    setField: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: againstField("overwrite", {depth: "*op_param", location: "stack"})
        },
        factoryMethod: ({field_depth}) => ({kind: "setField", data: field_depth})
    },
    setSavedField: {
        opDefinition: {
            paramType: ["usize", "usize"],
            rustOpHandler: againstField("overwrite", {depth: "*param0", location: {save: "*param1"}})
        },
        factoryMethod: ({field_depth, index}) => ({kind: "setSavedField", data: [field_depth, index]})
    },

    stringConcat: {
        opDefinition: {
            paramType: ["usize", "String"],
            rustOpHandler: `
            let mut strings = Vec::with_capacity(*param0);
            for n in 1..=*param0 {
                let str = match ${popStack} {
                    InterpreterType::string(s) => s,
                    InterpreterType::int(i) => i.to_string(),
                    InterpreterType::double(d) => d.to_string(),
                    _ => ${raiseErrorWithMessage("Cannot convert to string")}
                };
                strings.push(str);
            }
            strings.reverse();
            ${pushStack("InterpreterType::string(strings.join(param1))")};
            OpResult::Continue(current)
            `
        },
        factoryMethod: (p) => ({kind: "stringConcat", data: [p.nStrings, p.joiner]})
    },

    getField: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: againstField("get", {depth: "*op_param", location: "stack"})
        },
        factoryMethod: ({field_depth}) => ({kind: "getField", data: field_depth})
    },
    getSavedField: {
        opDefinition: {
            paramType: ["usize", "usize"],
            rustOpHandler: againstField("get", {depth: "*param0", location: {save: "*param1"}})
        },
        factoryMethod: ({field_depth, index}) => ({kind: "getSavedField", data: [field_depth, index]})
    },
    deleteSavedField: {
        opDefinition: {
            paramType: ["usize", "usize"],
            rustOpHandler: againstField("delete", {depth: "*param0", location: {save: "*param1"}})
        },
        factoryMethod: ({field_depth, index}) => ({kind: "deleteSavedField", data: [field_depth, index]})
    },
    pushSavedField: {
        opDefinition: {
            paramType: ["usize", "usize"],
            rustOpHandler: againstField("push", {depth: "*param0", location: {save: "*param1"}})
        },
        factoryMethod: ({field_depth, index}) => ({kind: "pushSavedField", data: [field_depth, index]})
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
            OpResult::Continue(current)
            `
        }
    },

    truncateHeap: {
        opDefinition: {
            rustOpHandler: `
            if *op_param > current.heap.len() {
                ${raiseErrorWithMessage("removing more variables than in existince")}
            } 
            current.heap.truncate(current.heap.len() - *op_param);  
            OpResult::Continue(current)
            `,
            paramType: ["usize"]
        },
        factoryMethod: (p) => ({kind: "truncateHeap", data: p})
    },

    offsetOpCursor: {
        opDefinition: {
            
            rustOpHandler: `

                if *param1 {
                    current.offset_cursor(true, *param0);
                } else {
                    current.offset_cursor(false, *param0 + 1);
                }
                OpResult::Continue(current)
                
            `,
            paramType: ["usize", "bool"]
        },
        // here if p == -2    
        // here if p == -1
        // this_op <--- this op, the offset.
        // next_op_index p == 0
        // here if p == 1
        factoryMethod: ({offset, direction}) => ({kind: "offsetOpCursor", data: [
            offset, direction === "fwd"
        ]})
    },

    conditonallySkipXops: {
        opDefinition: {
            rustOpHandler: `
                match ${popStack} {
                    InterpreterType::bool(b) => {
                        if b {
                            current.offset_cursor(true, *op_param);
                        }
                        OpResult::Continue(current)
                    },
                    _ => ${raiseErrorWithMessage("Cannot evaluate variable as boolean")}
                }
            `,
            paramType: ["usize"]
        },
    
        factoryMethod: (p) => ({kind: "conditonallySkipXops", data: p})
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
            rustOpHandler: `
            let value = current.heap.swap_remove(*op_param);
            return OpResult::Return{value, from: current};
            `
        }
    },

    returnStackTop: {
        opDefinition: {
            rustOpHandler: `
            let value = ${popStack};
            return OpResult::Return{value, from: current};
            `
        }
    },
    returnVoid: {
        opDefinition: {
            rustOpHandler: `
            return OpResult::Return{value: InterpreterType::None, from: current};
            `
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
            rustOpHandler: `match current.heap.get(*op_param) {
                Some(d) => {${pushStack("d.clone()")}; OpResult::Continue(current)},
                None => OpResult::Error(format!("Echoing variable that does not exist {}", *op_param), current)
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
                        Ok(d) => {${pushStack("d")}; OpResult::Continue(current)},
                        Err(e) => OpResult::Error(e.to_string(), current)
                    }
                        
            `
        }
    },   
    enforceSchemaOnHeap: {
        opDefinition: {
            paramType: ["usize", "usize"],
            rustOpHandler: `
            let v = ${unwrap_or_error("current.heap.get(*param1)")};
            let s = ${unwrap_or_error("globals.schemas.get(*param0)")};
            ${pushStack("InterpreterType::bool(adheres_to_schema(v, s, globals))")};
            OpResult::Continue(current)`,
        },
        factoryMethod: (p) => ({kind: "enforceSchemaOnHeap", data: [p.schema, p.heap_pos]})
    },
    insertFromHeap: {
        opDefinition: {
            paramType: ["usize", "String"],
            rustOpHandler: `
            let v = ${unwrap_or_error("current.heap.get(*param0)")};
            let db = ${getDb};
            let res = ${get_or_err(`storage::append(db, &param1, v).await`)};
            match res {
                InterpreterType::None => OpResult::Continue(current),
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
            let db = ${getDb};
            match ${get_or_err(`storage::append(db, op_param, &insert_elt).await`)} {
                InterpreterType::None => OpResult::Continue(current),
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
            let db = ${getDb};
            let res = ${get_or_err(`storage::query(db, op_param, &HashMap::new(), &HashMap::new()).await`)};
            ${pushStack(`res`)};
            OpResult::Continue(current)
            `
        },
        factoryMethod: (s) => ({kind: "getAllFromStore", data: s})
    },
    moveStackTopToHeap: {
        opDefinition: {
            rustOpHandler: `
            current.heap.push(${popStack});
            OpResult::Continue(current)
            `
        },
    },
    queryStore: {
        opDefinition: {
            paramType: ["String", "HashMap<String, InterpreterType>"],
            rustOpHandler: `
            let db = ${getDb};
            let res = ${get_or_err(`storage::query(db, &param0, &param1, &${popToObject}).await`)};
            ${pushStack("res")};
            OpResult::Continue(current)
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
            let db = ${getDb};
            let res = ${get_or_err(`storage::find_one(db, &param0, &param1, &${popToObject}).await`)};
            ${pushStack("res")};
            OpResult::Continue(current)
            `
        },
        factoryMethod: (d) => ({kind: "findOneInStore", data: d})
    },
    deleteOneInStore: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let db = ${getDb};
            let res = ${get_or_err(`storage::delete_one(db, op_param, &${popStack}).await`)};
            ${pushStack("res")};
            OpResult::Continue(current)
            `
        },
        factoryMethod: (data) => ({kind: "deleteOneInStore", data})
    },
    popStack: {
        opDefinition: {
            rustOpHandler: `
            ${popStack};
            OpResult::Continue(current)
            `
        }
    },

    instantiate: {
        opDefinition: {
            paramType: ["InterpreterType"],
            
            rustOpHandler: `
            ${pushStack("op_param.clone()")};
            OpResult::Continue(current)
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
                _ => ${raiseErrorWithMessage("Cannot pop from non-array")}
            };
            ${pushStack("res")};
            OpResult::Continue(current)
            `
        },
    },
    flattenArray: {
        opDefinition: {
            rustOpHandler: `
            let mut res = match ${popStack} {
                InterpreterType::Array(inner) => inner,
                _ => ${raiseErrorWithMessage("Cannot flatten non array")}
            };
            res.reverse();
            current.stack.append(&mut res);
            OpResult::Continue(current)
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
            OpResult::Continue(current)
            `
        },
    },
    moveStackToHeapArray: {
        opDefinition: {
            
            paramType: ["usize"],
            rustOpHandler: `
            let p = ${popStack};
            match ${unwrap_or_error(`current.heap.get_mut(*op_param)`)} {
                InterpreterType::Array(inner) => {
                    inner.push(p);
                    OpResult::Continue(current)
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
                    OpResult::Continue(current)
                },
                _ => ${raiseErrorWithMessage("Cannot push on non array")}
            }
            `
        },
    },

    //Stack top
    //---The value to be pushed
    // Position 0
    // Position 1

    pArrayPush: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: `
            let pushme = ${popStack};
            let pos = current.stack.len() - 1 - *op_param;
            match ${unwrap_or_error(`current.stack.get_mut(pos)`)} {
                InterpreterType::Array(inner) => {
                    inner.push(pushme);
                    OpResult::Continue(current)
                },
                _ => ${raiseErrorWithMessage("Cannot push on non array")}
            }
            `
        },
        factoryMethod: ({stack_offset}) => ({kind: "pArrayPush", data: stack_offset})
    },

    assignPreviousToField: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let value = ${popStack};
            match ${lastStack} {
                InterpreterType::Object(m) => {
                    m.insert(op_param.to_string(), value);
                    OpResult::Continue(current)
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
                InterpreterType::Array(a) => {
                    let i = ${get_or_err(`i64::try_from(a.len())`)};
                    ${pushStack("InterpreterType::int(i)")}; 
                    OpResult::Continue(current)
                },
                _ => ${raiseErrorWithMessage("Cannot take len of non array object")}
            }
            `
        }
    },
    ndArrayLen: {
        opDefinition: {
            rustOpHandler: `
            let len = match ${lastStack} {
                InterpreterType::Array(a) => {
                    let r = ${get_or_err(`i64::try_from(a.len())`)};
                    InterpreterType::int(r)
                },
                _ => ${raiseErrorWithMessage("Cannot take len of non array object")}
            };
            ${pushStack("len")};
            OpResult::Continue(current)
            `
        }
    },
    storeLen: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let filter = ${popToObject};
            let db = ${getDb};
            let res = ${get_or_err(`storage::measure(db, op_param, &filter).await`)};
            ${pushStack("res")};
            OpResult::Continue(current)
            `
        },
        factoryMethod: (data) => ({kind: "storeLen", data})
    },

    createUpdateDoc: {
        opDefinition: {
            paramType: ["InterpreterType"],
            rustOpHandler: `
            ${pushStack("op_param.clone()")};
            OpResult::Continue(current)
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
            let db = ${getDb};
            let res = ${get_or_err(`storage::find_and_update_one(db, param0, *param1, &query_doc, &update_doc).await`)};
            ${pushStack("res")};
            OpResult::Continue(current)
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
            let db = ${getDb};
            let res = ${get_or_err(`storage::replace_one(db, param0, &query_doc, &update_doc, *param1).await`)};
            ${pushStack(`InterpreterType::bool(res)`)};
            OpResult::Continue(current)
            `
        },
        factoryMethod: ({store, upsert}) => ({kind: "replaceOne", data: [store, upsert]})
    },

    setNestedField: {
        opDefinition: {
            paramType: ["Vec<String>"],
            rustOpHandler: `
            let data = ${popStack};
            let mut target = ${lastStack};
            let (last_field, earlier_fields) = ${unwrap_or_error(`op_param.split_last()`)};
            for f in earlier_fields {
                match target {
                    InterpreterType::Object(inner) => {
                        target = ${unwrap_or_error(`inner.get_mut(f)`)};
                    },
                    _ => ${raiseErrorWithMessage("Invalid field access")}
                }
            }
            
            match target {
                InterpreterType::Object(inner) => {
                    inner.insert(last_field.to_string(), data);
                    OpResult::Continue(current)
                }
                _ => ${raiseErrorWithMessage("Cannot set field on non object")}
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
            let mut target = ${unwrap_or_error("current.heap.get(*param0)")};
            for f in param1 {
                target = match target {
                    InterpreterType::Object(inner) => match inner.get(f) {
                        Some(v) => v,
                        None => ${raiseErrorWithMessage("Field does not exist: {}", "f")}
                    }
                    _ => ${raiseErrorWithMessage("Accessing field on non object")}
                };
            }

            ${pushStack("target.clone()")};
            OpResult::Continue(current)
            `
        },
        factoryMethod: (input) => ({kind: "copyFieldFromHeap", data: [input.heap_pos, input.fields]})
    },

    enforceSchemaInstanceOnHeap: {
        opDefinition: {
            paramType: ["usize", "Schema"],
            rustOpHandler: `
            let v = ${unwrap_or_error("current.heap.get(*param0)")};

            ${pushStack("InterpreterType::bool(adheres_to_schema(v, param1, globals))")};
            OpResult::Continue(current)
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
                _ => ${raiseErrorWithMessage("Unexpected non object")}
            };
            for selector in op_param {
                let (first, rest) = ${unwrap_or_error(`selector.split_first()`)};
                let mut obj = ${unwrap_or_error(`original_object.remove(first)`)};
                for field in rest {
                    obj = match obj {
                        InterpreterType::Object(mut o) => ${unwrap_or_error(`o.remove(field)`)},
                        _ => ${raiseErrorWithMessage("Unexpected non object")}
                    };
                }
                ${pushStack("obj")};
            }
            OpResult::Continue(current)
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
                InterpreterType::None => match second {
                    InterpreterType::None => true,
                    _ => false
                },

                _ => false
            })`)};
            OpResult::Continue(current)
            `
        }
    },
    less: {
        opDefinition: {
            rustOpHandler: `
            let right = ${popStack};
            let left = ${popStack};
            ${pushStack(applyAgainstNumbers("left", "right", "<", "bool"))};
            OpResult::Continue(current)
            `
        }
    },
    lesseq: {
        opDefinition: {
            rustOpHandler: `
            let right = ${popStack};
            let left = ${popStack};
            ${pushStack(applyAgainstNumbers("left", "right", "<=", "bool"))};
            OpResult::Continue(current)
            
            `
        }
    },
    boolAnd: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popToBool};
            let second = ${popToBool};
            ${pushStack("InterpreterType::bool(first && second)")};
            OpResult::Continue(current)
            `
        }
    },
    boolOr: {
        opDefinition: {
            rustOpHandler: `
            let first = ${popToBool};
            let second = ${popToBool};
            ${pushStack("InterpreterType::bool(first || second)")};
            OpResult::Continue(current)
            `
        }
    },
    assertHeapLen: {
        opDefinition: {
            paramType: ["usize"],
            rustOpHandler: `
            if current.heap.len() != *op_param {
                OpResult::Error(format!("unexpected heap len {}, found {}", *op_param, current.heap.len()), current)
            } else {
                OpResult::Continue(current)
            }
            `
        },
        factoryMethod: (data) => ({kind: "assertHeapLen", data})
    },

    repackageCollection: {
        opDefinition: {
            rustOpHandler: `
            let mut array = ${popToArray};
            let mut re = HashMap::with_capacity(array.len());
            while let Some(elt) = array.pop() {
                match elt {
                    InterpreterType::Object(mut o) => {
                        let t = ${unwrap_or_error(`o.remove("_key")`)};
                        let key = match t {
                            InterpreterType::string(s) => s,
                            _ => ${raiseErrorWithMessage("expected a string")}
                        };
                        let v = ${unwrap_or_error(`o.remove("_val")`)};
                        re.insert(key, v)
                    },
                    _ => ${raiseErrorWithMessage("unexpected type during repackage")}
                };
            }
            ${pushStack("InterpreterType::Object(re)")};
            OpResult::Continue(current)
            `
        }
    },

    plus: {
        opDefinition: {
            rustOpHandler:`
            let right = ${popStack};
            let left = ${popStack};
            let result = match left {
                InterpreterType::int(i1) => match right {
                    InterpreterType::int(i2) => InterpreterType::int(i1 + i2),
                    InterpreterType::double(d2) => InterpreterType::double(i1 as f64 + d2),
                    InterpreterType::string(s) => InterpreterType::string(format!("{}{}", i1, s)),
                    _ => ${raiseErrorWithMessage("not addable")}
                },
                InterpreterType::double(d1) => match right {
                    InterpreterType::int(i2) => InterpreterType::double(d1 + (i2 as f64)),
                    InterpreterType::double(d2) => InterpreterType::double(d1 + d2),
                    InterpreterType::string(s) => InterpreterType::string(format!("{}{}", d1, s)),
                    _ => ${raiseErrorWithMessage("not addable")}
                }, 
                InterpreterType::string(s) => match right {
                    InterpreterType::int(d) => InterpreterType::string(format!("{}{}", s, d)),
                    InterpreterType::double(d) => InterpreterType::string(format!("{}{}", s, d)),
                    InterpreterType::string(d) => InterpreterType::string(format!("{}{}", s, d)),
                    _ =>${raiseErrorWithMessage("not addable")}
                }
                _ => ${raiseErrorWithMessage("not addable")}
            };
            ${pushStack("result")};
            OpResult::Continue(current)
            `
            
        }
    },
    nMinus: {
        opDefinition: {
            rustOpHandler: mathOp("-")
        }
    },
    nDivide: {
        opDefinition: {
            rustOpHandler: mathOp("/")
        }
    },
    nMult: {
        opDefinition: {
            rustOpHandler: mathOp("*")
        }
    },
    getKeys: {
        opDefinition: {
            rustOpHandler: `
            let mut obj = ${popToObject};
            let keys = obj.drain().map(|(k, v)| InterpreterType::string(k)).collect();
            ${pushStack("InterpreterType::Array(keys)")};
            OpResult::Continue(current)
            `
        }
    },
    invoke: {
        
        opDefinition: {
            rustOpHandler: `
                let args = current.stack.split_off(current.stack.len() - *param1);
                let next_ops = ${unwrap_or_error(`globals.fns.get(param0)`)};
                let cntxt = Context::new(next_ops, args);
                let res = conduit_byte_code_interpreter_internal(
                    cntxt,
                    globals
                ).await;
                match res {
                    Ok(o) => {
                        current.stack.push(o);
                        OpResult::Continue(current)
                    },
                    Err(e) => OpResult::Error(e, current)
                }
            `,
            paramType: ["String", "usize"]
        },
        factoryMethod: ({name, args}) => ({kind:"invoke", data: [name, args]})
    },
    lock: {
        opDefinition: {
            rustOpHandler: `
            let mutex = locks::Mutex {
                name: ${popToString}
            };
            let lm = ${unwrap_or_error(`globals.lm`)};
            match mutex.acquire(lm).await {
                Ok(_) => {current.locks.insert(mutex.name.clone(), mutex); OpResult::Continue(current)},
                Err(e) => OpResult::Error(format!("Lock failure: {}", e), current)
            }

            `
        }
    },
    release: {
        opDefinition: {
            rustOpHandler: `
            let name = ${popToString};
            let mutex = ${unwrap_or_error(`current.locks.remove(&name)`)};
            let lm = ${unwrap_or_error(`globals.lm`)};
            match mutex.release(lm).await {
                Ok(_) => OpResult::Continue(current),
                Err(e) => OpResult::Error(format!("Failure releasing lock: {}", e), current)
            }

            `
        }
    },
    signRole: {
        opDefinition: {
            rustOpHandler: `
            let mut obj = ${popToObject};
            let name_value = ${unwrap_or_error(`obj.get("_name")`)};
            match name_value {
                InterpreterType::string(s) => {
                    let mut hasher = DefaultHasher::new();
                    hasher.write(s.as_bytes());
                    match obj.get("_state") {
                        Some(state) => {
                            state.hash(&mut hasher);
                        },
                        None => {}
                    };
                    let msg: [u8; 8] = hasher.finish().to_be_bytes();
                    let sig: [u8; 64] = ed25519::signature(&msg, globals.private_key);
                    if !ed25519::verify(&msg, globals.public_key, &sig) {
                        ${raiseErrorWithMessage(`Public key cannot validate signature.`)};
                    }
                    let all: Vec<InterpreterType> = sig.iter().map(|i| InterpreterType::int(*i as i64)).collect();
                    obj.insert("_sig".to_string(), InterpreterType::Array(all));
                    
                    ${(pushStack("InterpreterType::Object(obj)"))};
                    return OpResult::Continue(current);
                },
                _ => ${raiseErrorWithMessage("Expected to find a name for the role")}
            };
            
            `
        }
    },
    getType: {
        opDefinition: {
            rustOpHandler: `
            let val = ${popStack};
            let s = match val {
                InterpreterType::None => "none",
                InterpreterType::int(_) => "int",
                InterpreterType::bool(_) => "bool",
                InterpreterType::double(_) => "doub",
                InterpreterType::Array(_) => "arr",
                InterpreterType::string(_) => "str",
                InterpreterType::Object(_) => "obj"
            };
            ${pushStack("InterpreterType::string(s.to_string())")};
            OpResult::Continue(current)
            `
        }
    }
}


function mathOp(sym: string): string {
    return `let right = ${popStack};
    let left = ${popStack};
    ${pushStack(applyAgainstNumbers("left", "right", sym, "number"))};
    OpResult::Continue(current)`
}