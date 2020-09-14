
type OpDef<K="static"> = {
    readonly kind: K
    readonly rustEnumMember: string
    readonly rustOpHandler: string
}
type OpDefWithParameter = OpDef<"param"> & {readonly paramType: string}
export type AnyOpDef = OpDef | OpDefWithParameter

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
ParamOp<"enforceSchemaOnHeap", {heap_pos: number, schema: number}>


type StaticFactory<S> = OpInstance<S>

type ParamFactory<P, S> = (p: P) => OpInstance<S>

type OpFactoryFinder<C extends Ops> = C["class"] extends "static" ? StaticFactory<C["kind"]> : 
C["class"] extends "param" ? ParamFactory<C["paramType"], C["kind"]> :
never

export type CompleteOpFactory = {
    readonly [P in Ops["kind"]]: OpFactoryFinder<Extract<Ops, {kind: P}>>
};

type OpDefFinder<C extends Ops> = C["class"] extends "static" ? OpDef: 
C["class"] extends "param" ? OpDefWithParameter :
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


function raiseErrorWithMessage(s: string): string {
    return `Some("${s}".to_string())`
}

const popStack = `
    match stack.pop() {
        Some(v) => v,
        _ => panic!("Attempting to access non existent value")
    }
    `


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
            kind: "static",
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
            kind: "static",
            rustEnumMember: `noop`,
            rustOpHandler: ` None`
        },
        factoryMethod: {kind: "noop", data: undefined}
    },
    truncateHeap: {
        opDefinition: {
            kind: "param",
            rustOpHandler: `heap.truncate(heap.len() - *op_param);  None`,
            rustEnumMember: `truncateHeap`,
            paramType: "usize"
        },
        factoryMethod: (p) => ({kind: "truncateHeap", data: p})
    },

    gotoOp: {
        opDefinition: {
            kind: "param",
            rustEnumMember: `gotoOp`,
            // Set op_param to -1 because the op is always incremented at the end of each op execution.
            rustOpHandler: safeGoto("*op_param"),
            paramType: "usize"
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
            kind: "param",
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
            paramType: "usize"
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
            kind: "param",
            paramType: "usize",
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
            kind: "static",
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
            kind: "param",
            paramType: "usize",
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
            kind: "param",
            paramType: `String`,
            rustEnumMember: `fieldAccess`,
            rustOpHandler: `
                    match ${popStack} {
                        InterpreterType::Object(inside) => match inside.get(op_param) {
                            Some(o) =>  {${pushStack("o.clone()")}; None},
                            _ => ${raiseErrorWithMessage("Field does not access")}
                        },
                        _ => ${raiseErrorWithMessage("Attempting to reference a field that doesn't exist on current type")}
                    }
                        
            `
        }
    },   
    enforceSchemaOnHeap: {
        opDefinition: {
            kind: "param",
            paramType: "Vec<usize>",
            rustOpHandler: `
            match heap.get(op_param[1]) {
                Some(v) => {
                    if adheres_to_schema(&v, &schemas[op_param[0]]) {
                        None
                    } else {
                        ${raiseErrorWithMessage("Variable does not match the schema")}
                    }
                },
                None => ${raiseErrorWithMessage("No such heap variable exists")}
            }
            `,
            rustEnumMember: "enforceSchemaOnHeap"
        },
        factoryMethod: (p) => ({kind: "enforceSchemaOnHeap", data: [p.schema, p.heap_pos]})
    } 
}
