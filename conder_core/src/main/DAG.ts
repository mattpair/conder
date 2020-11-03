import {AnyOpInstance, ow, Utils, AnyInterpreterTypeInstance} from 'conder_kernel'

export type Node<K, DATA={}> = {
    kind: K
 } & DATA



export type AnyNode = 
Node<"Return", {value?: NodeOfType<"Bool" | "Object">}> |
Node<"Bool", {value: boolean}> |
Node<"Field", {name: string, value: NodeOfType<"Bool">}> |
Node<"Object", {fields: NodeOfType<"Field">[]}> 

type NodeOfType<K extends AnyNode["kind"]> = Extract<AnyNode, {kind: K}>


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

        default: Utils.assertNever(node)
    }
}