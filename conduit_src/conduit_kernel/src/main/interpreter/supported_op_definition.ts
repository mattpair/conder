import { Suppression } from "../rust_bound_types"
import { AnyInterpreterTypeInstance } from "./interpreter_writer"

type OpDef<NAME> = {
    readonly rustOpHandler: string
    readonly paramType?: string[]
}
type OpDefWithParameter<NAME> = OpDef<NAME> & {readonly paramType: string[]}
export type AnyOpDef = OpDef<string> | OpDefWithParameter<string>

type StaticOp<KIND> = Op<KIND, "static">

type ParamOp<KIND, P> = {kind: KIND, class: "param", paramType: P}

type OpClass = "static" | "param" 
type Op<KIND, C extends OpClass, P=undefined> = 
{kind: KIND, class: C, paramType?: P}

type Ops = 
ParamOp<"returnVariable", number> |
StaticOp<"returnStackTop"> |
ParamOp<"copyFromHeap", number > |
ParamOp<"fieldAccess", string> |
ParamOp<"gotoOp", number> |
ParamOp<"conditionalGoto", number>  |
StaticOp<"negatePrev"> |
StaticOp<"noop"> |
ParamOp<"truncateHeap", number> |
ParamOp<"enforceSchemaOnHeap", {heap_pos: number, schema: number}> |
ParamOp<"insertFromHeap", {heap_pos: number, store: string}> |
ParamOp<"getAllFromStore", string> |
ParamOp<"insertFromStack", string> |
StaticOp<"moveStackTopToHeap"> |
ParamOp<"queryStore", [string, Suppression]> |
ParamOp<"findOneInStore", [{store: string}, Suppression]> |
ParamOp<"deleteOneInStore", {store: string}> |
ParamOp<"instantiate", AnyInterpreterTypeInstance> |
StaticOp<"popArray"> |
StaticOp<"toBool"> |
ParamOp<"moveStackToHeapArray", number> |
StaticOp<"arrayPush"> |
ParamOp<"assignPreviousToField", string> |
StaticOp<"arrayLen"> |
ParamOp<"storeLen", string>

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

const popStack = `
    match stack.pop() {
        Some(v) => v,
        _ => panic!("Attempting to access non existent value")
    }
    `
const lastStack = `stack.last_mut().unwrap()`

function safeGoto(varname: string): string {
    return `
    if ${varname} >= ops.len() {
        panic!("Setting op index out of bounds");
    }
    next_op_index = ${varname} - 1;
    None
    `
}
function pushStack(instance: string): string {
    return `stack.push(${instance})`
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
    noop: {
        opDefinition: {
            rustOpHandler: ` None`
        },
    },
    truncateHeap: {
        opDefinition: {
            rustOpHandler: `heap.truncate(heap.len() - *op_param);  None`,
            paramType: ["usize"]
        },
        factoryMethod: (p) => ({kind: "truncateHeap", data: p})
    },

    gotoOp: {
        opDefinition: {
            // Set op_param to -1 because the op is always incremented at the end of each op execution.
            rustOpHandler: safeGoto("*op_param"),
            paramType: ["usize"]
        },
        //TODO: All param factory methods are the same. We should deduplicate.
        factoryMethod(p) {
            return {
                kind: "gotoOp",
                data: p
            }
        }
    },

    conditionalGoto: {
        opDefinition: {
            rustOpHandler: `
                match ${popStack} {
                    InterpreterType::bool(b) => {
                        if b {
                            ${safeGoto("*op_param")}
                        } else {
                            None
                        }
                    },
                    _ => ${raiseErrorWithMessage("Cannot evaluate variable as boolean")}
                }
            `,
            paramType: ["usize"]
        },
        factoryMethod: (p) => ({kind: "conditionalGoto", data: p})
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
                    let res = match ${lastStack} {
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
            if adheres_to_schema(&heap[*param1], &schemas[*param0]) {
                None
            } else {
                ${raiseErrorWithMessage("Variable does not match the schema")}
            }   
            `,
        },
        factoryMethod: (p) => ({kind: "enforceSchemaOnHeap", data: [p.schema, p.heap_pos]})
    },
    insertFromHeap: {
        opDefinition: {
            paramType: ["usize", "String"],
            rustOpHandler: `
            let schema = stores.get(param1).unwrap();
            storage::append(eng, &param1, schema, &heap[*param0]).await;
            None
            `
        },
        factoryMethod: (v) => ({kind: "insertFromHeap", data: [v.heap_pos, v.store]})
    },

    insertFromStack: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let schema = stores.get(op_param).unwrap();
            storage::append(eng, op_param, schema, &stack[stack.len() -1]).await;
            None
            `
        },
        factoryMethod: (v) => ({kind: "insertFromStack", data: v})
    },

    getAllFromStore: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let res = storage::getAll(eng, op_param, stores.get(op_param).unwrap()).await;
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
            paramType: ["String", "storage::Suppression"],
            rustOpHandler: `
            let res = storage::query(eng, &param0, &param1).await;
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
            paramType: ["String", "storage::Suppression"],
            rustOpHandler: `
            let res = storage::find_one(eng, param0, &${popStack}, param1).await;
            ${pushStack("res")};
            None
            `
        },
        factoryMethod: (d) => ({kind: "findOneInStore", data: [d[0].store, d[1]]})
    },
    deleteOneInStore: {
        opDefinition: {
            paramType: ["String"],
            rustOpHandler: `
            let res = storage::delete_one(eng, op_param, &${popStack}).await;
            ${pushStack("res")};
            None
            `
        },
        factoryMethod: (d) => ({kind: "deleteOneInStore", data: d.store})
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
            ${pushStack("storage::measure(eng, op_param).await")};
            None
            `
        },
        factoryMethod: (data) => ({kind: "storeLen", data})
    }

}
