import { NodeDefs, PickNode, LocalNodes, NodeWithNoXChildren, LocalValue, Node, RootNode } from './IR';
import {AnyOpInstance, ow, Utils, interpeterTypeFactory, } from 'conder_kernel'

export type LocalCompiler = Readonly<{
    [K in LocalNodes["kind"]]: (node: NodeWithNoXChildren<PickNode<K>, PickNode<"GlobalObject">>) => AnyOpInstance[]
}>


export function to_instr<N extends LocalNodes["kind"]>(node: PickNode<N>): AnyOpInstance[] {
    try {
        //@ts-ignore
        return local_to_instruction[node.kind](node)
    } catch (e) {
        console.error(node.kind, e)
        throw e
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

const boolAlg: Record<PickNode<"BoolAlg">["sign"], AnyOpInstance[]> = {
    "and": [ow.boolAnd],
    "or": [ow.boolOr]
}

export const local_to_instruction: LocalCompiler = {
    Bool: (n) => [ow.instantiate(n.value)],
    SetField: (n) => [
        ...n.field_name.flatMap(to_instr),
        ...to_instr(n.value),
        ow.setField({field_depth: n.field_name.length})
    ],
    GetField: n => [
        ...to_instr(n.target),
        ...n.field_name.flatMap(to_instr),
        ow.getField({field_depth: n.field_name.length})
    ],

    String: n => [ow.instantiate(n.value)],

    FieldExists: n => [
        ...to_instr(n.value),
        ...to_instr(n.field),
        ow.fieldExists
    ],

    Object: (n) => [
        ow.instantiate({}),
        ...n.fields.flatMap(to_instr)
    ],

    Return: (n) => [
        ...n.value ?  to_instr(n.value) : [ow.instantiate(null)],
        ow.returnStackTop
    ],

    Int: (n) => [ow.instantiate(interpeterTypeFactory.int(n.value))],

    Comparison: (n) => [
        ...to_instr(n.left),
        ...to_instr(n.right),
        ...comparisonLookup[n.sign]
    ],

    BoolAlg: (n) => [
        ...to_instr(n.left),
        ...to_instr(n.right),
        ...boolAlg[n.sign]
    ],

    If: (n) => {
        const ifTrue = to_instr(n.ifTrue)

        return [
            ...to_instr(n.cond),
            ow.negatePrev,
            ow.conditonallySkipXops(ifTrue.length),
            ...ifTrue,
            ...n.finally ? to_instr(n.finally) : [ow.noop] // give the opOffset somewhere to land.
        ]
    },

    Saved: n => [ow.copyFromHeap(n.index)],

    Save: n => [...to_instr(n.value), ow.moveStackTopToHeap],

    Update: n => {
        switch (n.operation.kind) {
            case "SetField":
                return [
                    // TODO: optimize this so the whole object doesn't need to be copied
                    ow.copyFromHeap(n.target.index), 
                    ...to_instr(n.operation),
                    ow.overwriteHeap(n.target.index)
                ]
            default: 
                return [
                    ...to_instr(n.operation),
                    ow.overwriteHeap(n.target.index)
                ]
        }
    }
}

export type CompileReady = LocalNodes

export const complete_compiler = {
    ...local_to_instruction
}