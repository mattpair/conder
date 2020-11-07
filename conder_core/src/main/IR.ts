
export type Node<K, DATA={}, META extends "root" | "not root"="not root"> = {
    kind: K
} & DATA & {_meta: META}
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
    "GlobalObject"
    >

export type LocalValue = Exclude<NodeWithNoXChildren<ValueNode, PickNode<"GlobalObject">>, PickNode<"GlobalObject">>
export type LocalNodes = Exclude<NodeWithNoXChildren<AnyNode, PickNode<"GlobalObject">>, PickNode<"GlobalObject">>
export type NodeDefs = 
Node<"Return", {value?: ValueNode}, "root"> |
Node<"Bool", {value: boolean}> |
Node<"SetField", {field_name: PickNode<"String" | "Saved">[], value: LocalValue}> |
Node<"GetField", {field_name: PickNode<"String" | "Saved">[], target: PickNode<"Saved" | "GlobalObject">}> |
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
    ifTrue: RootNode
    finally?: RootNode
}, "root"> | 
Node<"Saved", {index: number}> | 
Node<"String", {value: string}> | 
Node<"FieldExists", {value: ValueNode, field: ValueNode}> |
Node<"Save", {index: number, value: ValueNode}, "root"> |
Node<"Update", {
    target: PickNode<"Saved" | "GlobalObject">, 
    operation: PickNode<"SetField"> | LocalValue,
}, "root"> |
Node<"GlobalObject", {name: string}>


export type AnyNode = {
    [K in NodeDefs["kind"]]: Omit<Extract<NodeDefs, {kind: K}>, "_meta">
}[NodeDefs["kind"]]

export type RootNode = PickNode<Extract<NodeDefs, {_meta: "root"}>["kind"]>
export type PickNode<K extends NodeDefs["kind"]> = Extract<AnyNode, {kind: K}>

export type NodeWithNoXChildren<N extends AnyNode, X extends AnyNode> = {
    [F in keyof N]: N[F] extends ArrayLike<AnyNode> ? Array<Exclude<N[F][0], X>> : Exclude<N[F], X>
}



type ValueContainsGlobal<N extends AnyNode, X extends AnyNode=PickNode<"GlobalObject">> = {
    [F in keyof N]: N[F] extends ArrayLike<AnyNode> ? Extract<N[F][0], X> : Extract<N[F], X> extends never ? never : "yes"
}
type ContainsAGlobal<K extends AnyNode["kind"]> = ValueContainsGlobal<PickNode<K>>[keyof PickNode<K>]

type qqq = ContainsAGlobal<"Return">

type ContainsAGlobalLookup = {
    [K in AnyNode["kind"]]: ContainsAGlobal<K>
}

type aa = ContainsAGlobalLookup["Update"]