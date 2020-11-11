import { AnyOpInstance, Utils } from 'conder_kernel';

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


type AbstractNodes = PickNode<"GlobalObject">

export type BaseNodeDefs = {
    Return: Node<{value?: ValueNode}, "root">
    Bool: Node<{value: boolean}>
    SetField: Node<{field_name: PickNode<"String" | "Saved">[], value: ValueNode}>
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
    FieldExists: Node<{value: ValueNode, field: PickNode<"String">}>
    Save: Node<{index: number, value: ValueNode}, "root">
    Update: Node<{
        target: PickNode<"Saved" | "GlobalObject">, 
        operation: PickNode<"SetField"> | ValueNode,
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


type ReplaceIfAbstract<Nodes, Replace extends NodeSet> = Extract<Nodes, AbstractNodes> extends never ? Nodes : Exclude<Nodes, AbstractNodes> | AnyNodeFromSet<Replace>
type TargetNode<SomeNode, REPLACE extends NodeSet> = {
    [F in keyof SomeNode]: 
    SomeNode[F] extends ArrayLike<SomeNode> 
        ? Array<FullyImplementedNode<ReplaceIfAbstract<SomeNode[F][0], REPLACE>, REPLACE>>
        : SomeNode[F] extends AnyNode ? FullyImplementedNode<ReplaceIfAbstract<SomeNode[F], REPLACE>, REPLACE> : SomeNode[F]
}

type FullyImplementedNode<Nodes, REPLACE extends NodeSet> = Exclude<TargetNode<Nodes, REPLACE>, AbstractNodes>

export type PickNodeFromSet<S extends NodeSet, K extends keyof S> = Extract<AnyNodeFromSet<S>, {kind: K}>

export type CompleteCompiler<T extends NodeSet> = {
    [K in keyof T]: (n: NodeInstance<T, K>) => AnyOpInstance[]
}

export type TargetNodeSet<Replacement extends NodeSet> = (FullyImplementedNode<AnyNode, Replacement> | AnyNodeFromSet<Replacement>)
export type AbstractRemovalCompiler<Replacement extends NodeSet> = (roots: RootNode[]) => 
    TargetNodeSet<Replacement>[]

type AnyBaseNonAbstractKey =Exclude<keyof BaseNodeDefs, AbstractNodes["kind"]>
type AbstractNodeReplacerPairs<R extends NodeSet> = {
    // If the types of the node's fields change,
    // Then we know it needs a replacer.
    [K in AnyBaseNonAbstractKey]: Extract<
        {
            [F in keyof PickNode<K>]: PickNode<K>[F] extends Extract<TargetNodeSet<{}>, {kind: K}>[F] ? "same": "changed"
        }[keyof PickNode<K>],
        "changed"> extends never ? never : {
            kind: K
            map: (original: PickNode<K>) => Extract<TargetNodeSet<R>, {kind: K}>
        }
}[AnyBaseNonAbstractKey]


type AbstractNodeReplacementMap<R extends NodeSet> = {
    [K in AbstractNodeReplacerPairs<R>["kind"]]: Extract<AbstractNodeReplacerPairs<R>, {kind: K}>["map"]
}

export type PickTargetNode<R extends NodeSet, K extends keyof R | AnyBaseNonAbstractKey> = Extract<TargetNodeSet<R>, {kind: K}>

type GenericReplacer<R extends NodeSet> = <K extends AnyBaseNonAbstractKey>(n: PickNode<K>) => PickTargetNode<R, K>
type ReplacerFunction<K extends AnyBaseNonAbstractKey, R extends NodeSet> = (n: PickNode<K>, r: GenericReplacer<R>) => (PickTargetNode<R, K> | AnyNodeFromSet<R>)
export type RequiredReplacer<R extends NodeSet> =  {
    [K in AbstractNodeReplacerPairs<R>["kind"]]: ReplacerFunction<K, R>
}
type PassThroughReplacer = {
    [K in Exclude<AnyBaseNonAbstractKey, keyof AbstractNodeReplacementMap<{}>>]: ReplacerFunction<K, {}>
}


const PASS_THROUGH_REPLACER: PassThroughReplacer = {
    Bool: n => n,
    Object: n => n,
    Int: n => n,
    BoolAlg: n => n,
    Comparison: n => n,
    Saved: n => n,
    String: n => n
}

export function make_replacer<R extends NodeSet>(repl: RequiredReplacer<R>): GenericReplacer<R> {
    const requiresSelf = {...PASS_THROUGH_REPLACER, ...repl}
    const complete: any = {}
    //@ts-ignore
    const generic: GenericReplacer<R> = (n) => complete[n.kind](n)

    for (const key in requiresSelf) {
        //@ts-ignore
        complete[key] = (n) => requiresSelf[key](n, generic)
    }
    return generic
}