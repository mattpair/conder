import { Suppression } from "../rust_bound_types"
import { AnyInterpreterTypeInstance } from "./interpreter_writer"

type OpDef<NAME> = {
    readonly rustEnumMember: NAME
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
// ParamOp<"deleteOneInStore", {store: string}> |
ParamOp<"instantiate", AnyInterpreterTypeInstance> |
StaticOp<"popArray"> |
StaticOp<"toBool"> |
ParamOp<"moveStackToHeapArray", number> |
StaticOp<"arrayPush">


type StaticFactory<S> = OpInstance<S>

type ParamFactory<P, S> = (p: P) => OpInstance<S>

type OpFactoryFinder<C extends Ops> = C["class"] extends "static" ? StaticFactory<C["kind"]> : 
C["class"] extends "param" ? ParamFactory<C["paramType"], C["kind"]> :
never

export type CompleteOpFactory = {
    readonly [P in Ops["kind"]]: OpFactoryFinder<Extract<Ops, {kind: P}>>
};

type OpDefFinder<C extends Ops> = C["class"] extends "static" ? OpDef<C["kind"]>: 
C["class"] extends "param" ? OpDefWithParameter<C["kind"]> :
never

export type OpSpec<P extends Ops["kind"]> = Readonly<{
    factoryMethod: OpFactoryFinder<Extract<Ops, {kind: P}>>,
    opDefinition: OpDefFinder<Extract<Ops, {kind: P}>>
}>

export type CompleteOpSpec = {
    readonly [P in Ops["kind"]]: OpSpec<P>
}

export type CompleteOpWriter = {
    readonly [P in Ops["kind"]]: OpSpec<P>["factoryMethod"]
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
            rustEnumMember: `negatePrev`,
            rustOpHandler: `match ${popStack} {
                InterpreterType::bool(b) =>  {${pushStack("InterpreterType::bool(!b)")}; None},
                _ => ${raiseErrorWithMessage("Negating a non boolean value")}
            }`
        },
        factoryMethod: {kind: "negatePrev", data: undefined}
    },
    noop: {
        opDefinition: {
            rustEnumMember: `noop`,
            rustOpHandler: ` None`
        },
        factoryMethod: {kind: "noop", data: undefined}
    },
    truncateHeap: {
        opDefinition: {
            rustOpHandler: `heap.truncate(heap.len() - *op_param);  None`,
            rustEnumMember: `truncateHeap`,
            paramType: ["usize"]
        },
        factoryMethod: (p) => ({kind: "truncateHeap", data: p})
    },

    gotoOp: {
        opDefinition: {
            rustEnumMember: `gotoOp`,
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
            rustEnumMember: "conditionalGoto",
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
            rustEnumMember: `returnVariable`,
            rustOpHandler: ` return Ok(heap.swap_remove(*op_param))`
        }
    },

    returnStackTop: {
        factoryMethod: {    
            kind: "returnStackTop",
            data: undefined    
        },
        opDefinition: {
            rustEnumMember: `returnStackTop`,
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
            rustEnumMember: `copyFromHeap`,
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
            rustEnumMember: `fieldAccess`,
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
            rustEnumMember: "enforceSchemaOnHeap"
        },
        factoryMethod: (p) => ({kind: "enforceSchemaOnHeap", data: [p.schema, p.heap_pos]})
    },
    insertFromHeap: {
        opDefinition: {
            paramType: ["usize", "String"],
            rustEnumMember: "insertFromHeap",
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
            rustEnumMember: "insertFromStack",
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
            rustEnumMember: "getAllFromStore",
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
            rustEnumMember: "moveStackTopToHeap",
            rustOpHandler: `
            heap.push(${popStack});
            None
            `
        },
        factoryMethod: {kind: "moveStackTopToHeap", data: undefined}
    },
    queryStore: {
        opDefinition: {
            paramType: ["String", "storage::Suppression"],
            rustEnumMember: "queryStore",
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
            rustEnumMember: "findOneInStore",
            rustOpHandler: `
            let res = storage::find_one(eng, param0, &storage::FindOneQuery {
                resembling: ${popStack}
            }, param1).await;
            ${pushStack("res")};
            None
            `
        },
        factoryMethod: (d) => ({kind: "findOneInStore", data: [d[0].store, d[1]]})
    },

    instantiate: {
        opDefinition: {
            paramType: ["InterpreterType"],
            rustEnumMember: "instantiate",
            rustOpHandler: `
            ${pushStack("op_param.clone()")};
            None
            `
        },
        factoryMethod: (data) => ({kind: "instantiate", data})
    },
    popArray: {
        opDefinition: {
            rustEnumMember: "popArray",
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
        factoryMethod: {
            kind: "popArray",
            data: undefined
        }
    },
    toBool: {
        opDefinition: {
            rustEnumMember: "toBool",
            rustOpHandler: `
            let val = match &${lastStack} {
                InterpreterType::None => InterpreterType::bool(false),
                _ => InterpreterType::bool(true)
            };
            ${pushStack("val")};
            None
            `
        },
        factoryMethod: {kind: "toBool", data: undefined}
    },
    moveStackToHeapArray: {
        opDefinition: {
            rustEnumMember: "moveStackToHeapArray",
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
            rustEnumMember: "arrayPush",
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
        factoryMethod: {kind: "arrayPush", data: undefined}
    },

}
