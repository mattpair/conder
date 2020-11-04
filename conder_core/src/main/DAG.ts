import {AnyOpInstance, ow, Utils, interpeterTypeFactory} from 'conder_kernel'

export type Node<K, DATA={}> = {
    kind: K
 } & DATA



export type AnyNode = 
Node<"Return", {value?: PickNode<"Bool" | "Object" | "Comparison" | "BoolAlg" | "Int" | "Input">}> |
Node<"Bool", {value: boolean}> |
Node<"Field", {name: string, value: PickNode<"Bool" | "Input">}> |
Node<"Object", {fields: PickNode<"Field">[]}> |
Node<"Int", {value: number}> |
Node<"Comparison", {
    sign: "==" | "!=" | "<" | ">" | "<=" | ">="
    left: PickNode<"Int" | "Input">
    right: PickNode<"Int" | "Input">
}> |
Node<"BoolAlg", {
    sign: "and" | "or", 
    left: PickNode<"Bool" | "Comparison" | "Input">, 
    right: PickNode<"Bool" | "Comparison"| "Input">}> |
Node<"If", {
    cond: PickNode<"Bool" | "Comparison" | "BoolAlg" | "Input">
    ifTrue: AnyNode
    finally?: AnyNode
}> | 
Node<"Input", {index: number}>

export type PickNode<K extends AnyNode["kind"]> = Extract<AnyNode, {kind: K}>


export function compile(...nodes: AnyNode[]): AnyOpInstance[] {
    return nodes.flatMap(node => {
        switch (node.kind) {
            case "Bool":
                return [ow.instantiate(node.value)]
            case "Field":
                return [
                    ...compile(node.value),
                    ow.assignPreviousToField(node.name)
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
    
            case "Input":
                return [
                    ow.copyFromHeap(node.index)
                ]

            default: Utils.assertNever(node)
        }
    })
    
}