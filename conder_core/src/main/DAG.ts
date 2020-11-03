import {AnyOpInstance, ow, Utils, interpeterTypeFactory} from 'conder_kernel'

export type Node<K, DATA={}> = {
    kind: K
 } & DATA



export type AnyNode = 
Node<"Return", {value?: NodeOfType<"Bool" | "Object" | "Comparison">}> |
Node<"Bool", {value: boolean}> |
Node<"Field", {name: string, value: NodeOfType<"Bool">}> |
Node<"Object", {fields: NodeOfType<"Field">[]}> |
Node<"Int", {value: number}> |
Node<"Comparison", {
    sign: "==" | "!=" | "<" | ">" | "<=" | ">="
    left: NodeOfType<"Int">
    right: NodeOfType<"Int">
}>

export type NodeOfType<K extends AnyNode["kind"]> = Extract<AnyNode, {kind: K}>


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
            const comparisonLookup: Record<NodeOfType<"Comparison">["sign"], AnyOpInstance[]> = {
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

        default: Utils.assertNever(node)
    }
}