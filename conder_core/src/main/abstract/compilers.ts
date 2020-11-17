import { AnyOpInstance, ow, Utils } from '../ops/index';
import { BaseNodesFromTargetSet, PickNode, TargetNodeSet } from './IR';

export type Transform<I, O> = {
    then<N>(t: Transform<O, N>): Transform<I, N>

    run(i: I): O
}

export type Compiler<I> = Transform<I, AnyOpInstance[]>



export class Transformer<I, O> implements Transform<I, O> {
    readonly f: (i: I) => O
    constructor(f: (i: I) => O) {this.f= f}
    
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
            const ifTrue = full_compiler(n.ifTrue)

            return [
                ...full_compiler(n.cond),
                ow.negatePrev,
                ow.conditonallySkipXops(ifTrue.length),
                ...ifTrue,
                ...n.finally ? full_compiler(n.finally) : [ow.noop] // give the opOffset somewhere to land.
            ]
        }

        default: Utils.assertNever(n)
    }
}
