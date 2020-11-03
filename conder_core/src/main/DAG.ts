import {AnyOpInstance, ow, Utils, interpeterTypeFactory} from 'conder_kernel'

export type Node<K, DATA={}> = {
    kind: K
 } & DATA



export type AnyNode = 
Node<"Return", {value?: PickNode<"Bool" | "Object" | "Comparison" | "BoolAlg" | "Int">}> |
Node<"Bool", {value: boolean}> |
Node<"Field", {name: string, value: PickNode<"Bool">}> |
Node<"Object", {fields: PickNode<"Field">[]}> |
Node<"Int", {value: number}> |
Node<"Comparison", {
    sign: "==" | "!=" | "<" | ">" | "<=" | ">="
    left: PickNode<"Int">
    right: PickNode<"Int">
}> |
Node<"BoolAlg", {
    sign: "and" | "or", 
    left: PickNode<"Bool" | "Comparison">, 
    right: PickNode<"Bool" | "Comparison">}> |
Node<"If", {
    cond: PickNode<"Bool" | "Comparison" | "BoolAlg">
    ifTrue: AnyNode
    finally?: AnyNode
}>

export type PickNode<K extends AnyNode["kind"]> = Extract<AnyNode, {kind: K}>


export function compile(node: AnyNode): AnyOpInstance[] {
    switch (node.kind) {
        case "Bool":
            return [ow.instantiate(node.value)]
        case "Field":
            return [
                ...compile(node.value),
                ow.assignPreviousToField(node.name)
            ]

        case "Object":
            const fields = node.fields.flatMap((compile))
            return [
                ow.instantiate({}),
                ...fields
            ]
        
        case "Return":
            return [
                ...node.value ? compile(node.value) : [ow.instantiate(null)],
                ow.returnStackTop
            ]

        case "Int":
            return [
                ow.instantiate(interpeterTypeFactory.int(node.value))
            ]

        case "Comparison":
            const comparisonLookup: Record<PickNode<"Comparison">["sign"], AnyOpInstance[]> = {
                "!=": [ow.equal, ow.negatePrev],
                "==": [ow.equal],
                "<": [ow.less],
                ">": [ow.lesseq, ow.negatePrev],
                ">=": [ow.less, ow.negatePrev],
                "<=": [ow.lesseq]
            }

            return [
                ...compile(node.left),
                ...compile(node.right),
                ...comparisonLookup[node.sign]
            ]

        case "BoolAlg":
            // TODO: optimize this for skiping the right branch
            const boolAlg: Record<PickNode<"BoolAlg">["sign"], AnyOpInstance[]> = {
                "and": [ow.boolAnd],
                "or": [ow.boolOr]
            }             
            return [
                ...compile(node.left),
                ...compile(node.right),
                ...boolAlg[node.sign]
            ]

        case "If":
            const ifTrue = compile(node.ifTrue)
            return [
                ...compile(node.cond),
                ow.negatePrev,
                ow.conditionalOpOffset(ifTrue.length + 1),
                ...ifTrue,
                ...node.finally ? compile(node.finally) : [ow.noop] // give the opOffset somewhere to land.
            ]
        default: Utils.assertNever(node)
    }
}