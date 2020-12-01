import { AnyOpInstance, ow, Utils } from '../ops/index';
import { FunctionDescription } from './function';
import { BaseNodesFromTargetSet, PickNode, PickTargetNode, TargetNodeSet } from './IR';

export type Transform<I, O> = {
    then<N>(t: Transform<O, N>): Transform<I, N>

    tap(f: (data: O) => void): Transform<I, O>
    run(i: I): O
}

export type MapTransform<I, O> = Transform<Map<string, I>, Map<string, O>>
export type Compiler<FROM> = Transform<Map<string, FunctionDescription<FROM>>, Map<string, FunctionDescription<AnyOpInstance>>>



export class Transformer<I, O> implements Transform<I, O> {
    readonly f: (i: I) => O
    constructor(f: (i: I) => O) {this.f= f}

    public static Map<I, O>(f: (data: I) => O): MapTransform<I, O> {

        return new Transformer((input: Map<string, I>) => {
            const out: Map<string, O> = new Map()
            input.forEach((v, k) => {
                out.set(k, f(v))
            })
            return out
        })
    }

    tap(f: (data: O) =>void): Transform<I, O> {
        return this.then(new Transformer((input) => {
            f(input)
            return input
        }))
    }
    
    then<N>(t: Transform<O, N>): Transform<I, N> {
        const f = this.f
        return new Transformer((i: I) => t.run(f(i)))
    }

    run(i: I): O {
        return this.f(i)
    }
}

const comparisonLookup: Record<PickNode<"Comparison">["sign"], AnyOpInstance[]> = {
    "!=": [ow.equal, ow.negatePrev],
    "==": [ow.equal],
    "<": [ow.less],
    ">": [ow.lesseq, ow.negatePrev],
    ">=": [ow.less, ow.negatePrev],
    "<=": [ow.lesseq]
}

const mathLookup: Record<PickNode<"Math">["sign"], AnyOpInstance[]> = {
    "+": [ow.nPlus],
    "-": [ow.nMinus],
    "/": [ow.nDivide],
    "*": [ow.nMult],
}

const boolAlg: Record<PickNode<"BoolAlg">["sign"], AnyOpInstance[]> = {
    "and": [ow.boolAnd],
    "or": [ow.boolOr]
}

// Last entry is guaranteed to be a finally
function create_well_formed_branch(n: PickTargetNode<{}, "If">): PickTargetNode<{}, "If">["conditionally"] {
    const wellFormed: PickTargetNode<{}, "If">["conditionally"] = []
    let state: "needs conditional" | "conditions" | "maybe finally" | "done" = "needs conditional"
    for (let index = 0; index < n.conditionally.length; index++) {
        const branch = n.conditionally[index];
        switch (state) {
            case "needs conditional":
                if (branch.kind !== "Conditional") {
                    throw Error(`Expected a conditional branch`)
                }
                wellFormed.push(branch)
                state = "conditions"
                break
            case "conditions":
                switch (branch.kind) {
                    case "Finally":
                        wellFormed.push(branch)
                        state = "done"
                        break
                    case "Else":
                        state = "maybe finally"
                    case "Conditional":
                        wellFormed.push(branch)
                        break
                }
                
                break
            case "maybe finally":
                if (branch.kind !== "Finally") {
                    throw Error(`Expected a finally branch`)
                }
                wellFormed.push(branch)
                state = "done"
                break
            
            default: const n: never = state
        }
        if (state === "done"){
            break
        }
        
    }

    switch (state) {
        case "needs conditional":
            throw Error(`Branch without any conditionals`)
        case "conditions":
        case "maybe finally":
            wellFormed.push({kind: "Finally", do: {kind: "Noop"}})
        case "done":
            break
    }
    return wellFormed

}

export function base_compiler(n: BaseNodesFromTargetSet<{}>, full_compiler: (a: TargetNodeSet<{}>) => AnyOpInstance[]): AnyOpInstance[] {
    switch (n.kind) {
        case "Bool":
        case "Int":
        case "String":
            
            return [ow.instantiate(n.value)]

        case "Math":
            return [
                ...full_compiler(n.left),
                ...full_compiler(n.right),
                ...mathLookup[n.sign]
            ]

        case "BoolAlg":
            return [
                ...full_compiler(n.left),
                ...full_compiler(n.right),
                ...boolAlg[n.sign]
            ]

        case "Comparison":
            return [
                ...full_compiler(n.left),
                ...full_compiler(n.right),
                ...comparisonLookup[n.sign]
            ]
        case "FieldExists":
            
            return [
                ...full_compiler(n.value),
                ...full_compiler(n.field),
                ow.fieldExists
            ]

        case "Object":
            return [
                ow.instantiate({}),
                ...n.fields.flatMap(full_compiler)
            ]

        case "Return":
            return [
                ...(n.value ?  full_compiler(n.value) : [ ow.instantiate(null) ]),
                ow.returnStackTop
            ]

        
        case "Save":
            return [...full_compiler(n.value), ow.moveStackTopToHeap]
        case "Saved":
            return [ow.copyFromHeap(n.index)]
        
        case "SetField":
            return [
                ...n.field_name.flatMap(full_compiler),
                ...full_compiler(n.value),
                ow.setField({field_depth: n.field_name.length})
            ]

        case "Update":
            
            switch (n.operation.kind) {
                case "SetField":
                case "DeleteField":

                    return [
                        ...full_compiler(n.target), 
                        ...full_compiler(n.operation),
                        ow.overwriteHeap(n.target.index)
                    ]
                    
                default: 
                    return [
                        ...full_compiler(n.operation),
                        ow.overwriteHeap(n.target.index)
                    ]
            }
        case "GetField":
            
            return [
                ...full_compiler(n.target),
                ...n.field_name.flatMap(full_compiler),
                ow.getField({field_depth: n.field_name.length})
            ]
        case "If":{
            const wellFormed = create_well_formed_branch(n)
            const fin = full_compiler(wellFormed.pop().do)
            const first_to_last = wellFormed.reverse()
            const conditionals: (AnyOpInstance | "skip to finally")[] = []
            while (first_to_last.length > 0) {
                const this_branch = wellFormed.pop()
                const this_branch_ops: (AnyOpInstance | "skip to finally")[] = [
                    ...full_compiler(this_branch.do), // do this
                    "skip to finally" // then skip to finally
                ]

                switch (this_branch.kind) {
                    case "Else":
                        conditionals.push(...this_branch_ops)
                        break
                    case "Conditional":
                        conditionals.push(
                            ...full_compiler(this_branch.cond),
                            ow.negatePrev,
                            ow.conditonallySkipXops(this_branch_ops.length), // Skip to next condition
                            ...this_branch_ops,                            
                            )

                        break
                }
            }
            
            
            return [
                ...conditionals.map((op, index) => {
                    if (op === "skip to finally") {
                        return ow.offsetOpCursor({offset: conditionals.length - index, direction: "fwd"})
                    } else {
                        return op
                    }
                }),
                ...fin
            ]
            // n.conditionally.f
            // const ifTrue = full_compiler(n.ifTrue)
            // const elseOps = n.else ? full_compiler(n.else) : [ow.noop]
            // return [
            //     ...ifTrue,
            //     ow.offsetOpCursor(elseOps.length),
            //     ...elseOps,
            //     ...n.finally ? full_compiler(n.finally) : [ow.noop] // give the opOffset somewhere to land.
            // ]
        }

        case "DeleteField": {
            return [
                ...n.field_name.flatMap(full_compiler),
                ow.deleteField({field_depth: n.field_name.length}),
            ]
        }
        case "Noop": 
            return [ow.noop]
        case "None":
            return [ow.instantiate(null)]

        case "ArrayForEach":
            const loop: AnyOpInstance[] = [
                ow.popArray,
                ow.moveStackTopToHeap,
                ...n.do.flatMap(full_compiler),
                ow.truncateHeap(1),
            ]
            loop.push(ow.offsetOpCursor({offset: loop.length + 4, direction: "bwd"}))
            return[
                ...full_compiler(n.target),
                ow.ndArrayLen,
                ow.instantiate(0),
                ow.equal,
                ow.conditonallySkipXops(loop.length),
                ...loop,
                ow.popStack
            ]

        case "ArrayLiteral":
            const arr: AnyOpInstance[] = [
                ow.instantiate([]),
            ]
            n.values.forEach(v => {
                arr.push(
                    ...full_compiler(v),
                    ow.arrayPush
                )
            })
            return arr

        case "Conditional":
        case "Finally":
        case "Else":
            throw Error(`${n.kind} should be compiled within if`)
        default: Utils.assertNever(n)
    }
}
