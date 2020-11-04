import {AnyOpInstance, ow, Utils, interpeterTypeFactory} from 'conder_kernel'

export type Node<K, DATA={}> = {
    kind: K
 } & DATA


type ValueNode = PickNode<
    "Bool" | 
    "Object" | 
    "Comparison" | 
    "BoolAlg" | 
    "Int" | 
    "Saved" | 
    "String" |
    "FieldExists"
    >
export type AnyNode = 
Node<"Return", {value?: ValueNode}> |
Node<"Bool", {value: boolean}> |
Node<"SetField", {name: PickNode<"String" | "Saved">, value: ValueNode}> |
Node<"Object", {fields: PickNode<"SetField">[]}> |
Node<"Int", {value: number}> |
Node<"Comparison", {
    sign: "==" | "!=" | "<" | ">" | "<=" | ">="
    left: PickNode<"Int" | "Saved">
    right: PickNode<"Int" | "Saved">
}> |
Node<"BoolAlg", {
    sign: "and" | "or", 
    left: PickNode<"Bool" | "Comparison" | "Saved">, 
    right: PickNode<"Bool" | "Comparison"| "Saved">}> |
Node<"If", {
    cond: PickNode<"Bool" | "Comparison" | "BoolAlg" | "Saved">
    ifTrue: AnyNode
    finally?: AnyNode
}> | 
Node<"Saved", {index: number}> | 
Node<"String", {value: string}> | 
Node<"FieldExists", {value: ValueNode, field: ValueNode}>

export type PickNode<K extends AnyNode["kind"]> = Extract<AnyNode, {kind: K}>


export function compile(...nodes: AnyNode[]): AnyOpInstance[] {
    return nodes.flatMap(node => {
        switch (node.kind) {
            case "Bool":
                return [ow.instantiate(node.value)]
            case "SetField":
                return [
                    ...compile(node.name),
                    ...compile(node.value),
                    ow.setField
                ]
    
            case "Object":
                const fields = compile(...node.fields)
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
                    ow.conditonallySkipXops(ifTrue.length),
                    ...ifTrue,
                    ...node.finally ? compile(node.finally) : [ow.noop] // give the opOffset somewhere to land.
                ]
    
            case "Saved":
                return [
                    ow.copyFromHeap(node.index)
                ]

            case "String":
                return [
                    ow.instantiate(node.value)
                ]

            case "FieldExists":
                return [
                    ...compile(node.value),
                    ...compile(node.field),
                    ow.fieldExists
                ]

            default: Utils.assertNever(node)
        }
    })
    
}