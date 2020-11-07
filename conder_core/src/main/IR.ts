import { AnyOpInstance } from 'conder_kernel';

export type Node<DATA={}, META extends "root" | "not root"="not root"> = DATA & {_meta: META}
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
export type LocalNodeUnion = Exclude<NodeWithNoXChildren<AnyNode, PickNode<"GlobalObject">>, PickNode<"GlobalObject">>
export type LocalNodeSet = {
    [K in LocalNodeUnion["kind"]]: Extract<LocalNodeUnion, {kind: K}> & {_meta: BaseNodeDefs[K]["_meta"]}
}

export type BaseNodeDefs = {
    Return: Node<{value?: ValueNode}, "root">
    Bool: Node<{value: boolean}>
    SetField: Node<{field_name: PickNode<"String" | "Saved">[], value: LocalValue}>
    GetField: Node<{field_name: PickNode<"String" | "Saved">[], target: PickNode<"Saved" | "GlobalObject">}>
    Object: Node<{fields: PickNode<"SetField">[]}>
    Int: Node<{value: number}> 
    Comparison: Node<
        {
        sign: "==" | "!=" | "<" | ">" | "<=" | ">="
        left: PickNode<"Int" | "Saved">
        right: PickNode<"Int" | "Saved">
    }>
    BoolAlg: Node<{
        sign: "and" | "or", 
        left: PickNode<"Bool" | "Comparison" | "Saved">, 
        right: PickNode<"Bool" | "Comparison"| "Saved">}>

    If: Node<{
        cond: PickNode<"Bool" | "Comparison" | "BoolAlg" | "Saved">
        ifTrue: RootNode
        finally?: RootNode
    }, "root">  

    Saved: Node<{index: number}> 
    String: Node<{value: string}>
    FieldExists: Node<{value: ValueNode, field: ValueNode}>
    Save: Node<{index: number, value: ValueNode}, "root">
    Update: Node<{
        target: PickNode<"Saved" | "GlobalObject">, 
        operation: PickNode<"SetField"> | LocalValue,
    }, "root">
    GlobalObject: Node<{name: string}>
}

type NodeSet= {[K in string]: Node<{}, "not root" | "root">} 
type NodeInstance<S extends NodeSet, K extends keyof S> = Omit<S[K], "_meta"> & {kind: K}
export type AnyNodeFromSet<S extends NodeSet> = {
    [K in keyof S]: NodeInstance<S, K>
}[keyof S]

export type AnyNode = AnyNodeFromSet<BaseNodeDefs>
export type RootNode = AnyRootNodeFromSet<BaseNodeDefs>
export type AnyRootNodeFromSet<S extends NodeSet> = {
    [K in keyof S]: S[K]["_meta"] extends "not root" ? never : {kind: K} & Omit<S[K], "_meta">
}[keyof S]

export type PickNode<K extends keyof BaseNodeDefs> = Extract<AnyNode, {kind: K}>

export type NodeWithNoXChildren<N extends AnyNode, X extends AnyNode> = {
    [F in keyof N]: N[F] extends ArrayLike<AnyNode> ? Array<Exclude<N[F][0], X>> : Exclude<N[F], X>
}

export type PickNodeFromSet<S extends NodeSet, K extends keyof S> = Extract<AnyNodeFromSet<S>, {kind: K}>

export type CompleteCompiler<T extends NodeSet> = {
    [K in keyof T]: (n: NodeInstance<T, K>) => AnyOpInstance[]
}

