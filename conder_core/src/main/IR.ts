
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
    "FieldExists" |
    "GetField" |
    "Global"
    >

export type LocalNodes = Exclude<NodeWithNoXChildren<AnyNode, PickNode<"Global">>, PickNode<"Global">>
export type AnyNode = 
Node<"Return", {value?: ValueNode}> |
Node<"Bool", {value: boolean}> |
Node<"SetField", {field_name: PickNode<"String" | "Saved">[], value: ValueNode}> |
Node<"GetField", {field_name: PickNode<"String" | "Saved">[], value: ValueNode}> |
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
Node<"FieldExists", {value: ValueNode, field: ValueNode}> |
Node<"Save", {index: number, value: ValueNode}> |
Node<"Update", {
    index: number, 
    operation: PickNode<"SetField"> | ValueNode,
}> |
Node<"Global", {name: string}>

export type PickNode<K extends AnyNode["kind"]> = Extract<AnyNode, {kind: K}>

export type NodeWithNoXChildren<N extends AnyNode, X extends AnyNode> = {
    // Exclude<PickNode<"GetField">, PickNode<"String">>
    // Works for non arrays
    //
    [F in keyof N]: N[F] extends ArrayLike<AnyNode> ? Array<Exclude<N[F][0], X>> : Exclude<N[F], X>
}