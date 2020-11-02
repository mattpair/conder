import {AnyOpInstance, getOpWriter, Utils, AnyInterpreterTypeInstance} from 'conder_kernel'
import * as mongodb from 'mongodb'
type AnyObject = {[K in string]: AnyObject | number | string | boolean }
type MongoFilter = mongodb.FilterQuery<any>
// type Node<KIND, DATA={}> = {
//     kind: KIND
//     next?: AnyNode
// } & DATA

type RequiresStoreName = {store: string}
type Value<K extends string="value", V=AnyInterpreterTypeInstance> = {[k in K]: V}
type RequiresNext<K extends keyof NodeInstanceDef> = {next: NodeInstanceDef[K]}
type CanHaveNext<K extends keyof NodeInstanceDef> = {next?: NodeInstanceDef[K]}
type Node<K extends keyof NodeTypeDefs> = Omit<{kind: K} & NodeTypeDefs[K], "_meta">
type MayBeRoot = {_meta: {mayBeRoot: true}}

export type NodeTypeDefs = {
    return: {},
    select: RequiresStoreName & RequiresNext<"return">
    append: RequiresStoreName
    instance: Value & RequiresNext<"return" | "append" | "staticFilter"> & MayBeRoot
    staticFilter: Value<"filter", MongoFilter> & RequiresNext<"select" | "len" | "updateOne" | "deleteOne"> & MayBeRoot,
    len: RequiresNext<"return"> & RequiresStoreName & MayBeRoot
    updateOne: CanHaveNext<"return"> & RequiresStoreName
    deleteOne: CanHaveNext<"return"> & RequiresStoreName
}
type NodeInstanceDef = {
    [P in keyof NodeTypeDefs]: Node<P>
}
export type AnyNode = NodeInstanceDef[keyof NodeInstanceDef]

type RootNodeKinds= Exclude<
    {
        [k in AnyNode["kind"]]: NodeTypeDefs[k] extends MayBeRoot ? k: never
    }[AnyNode["kind"]], 
    never
>
export type AnyRootNode = Extract<AnyNode, {kind: RootNodeKinds}>
export type AnyChildNode = Exclude<AnyNode, {kind: RootNodeKinds}>

const opWriter = getOpWriter()

export function root_node_to_instruction(node: AnyRootNode): AnyOpInstance[] {
    switch (node.kind) {
        case "staticFilter":
            return [
                opWriter.instantiate(node.filter),
                ...any_node_to_instruction(node.next)
            ]
        case "instance":
            return [
                opWriter.instantiate(node.value),
                ...any_node_to_instruction(node.next)
            ]

        case "len": 
            return [
                opWriter.storeLen(node.store),
                ...child_node_to_instruction(node.next)
            ]
        default: Utils.assertNever(node)
    }
}

function child_node_to_instruction(node: AnyChildNode): AnyOpInstance[] {
    switch (node.kind) {
        case "return":
            return [opWriter.returnStackTop]
        case "select": 
            return [
                opWriter.queryStore([node.store, {}]),
                ...any_node_to_instruction(node.next)
            ]
        
        case "append":
            return [
                opWriter.insertFromStack(node.store)
            ]

        case "updateOne":
        case "deleteOne":
            const s = node.store
            return [
                node.kind === "deleteOne" ? opWriter.deleteOneInStore(s) : opWriter.updateOne(s),
                ...node.next ? any_node_to_instruction(node.next) : [opWriter.popStack]
            ]
        default: Utils.assertNever(node)
    }
}
function any_node_to_instruction(node: AnyNode): AnyOpInstance[] {
    switch (node.kind) {
        case "return":
        case "select": 
        case "append":
        case "updateOne":
        case "deleteOne":
            return child_node_to_instruction(node)
        
        case "instance":
        case "staticFilter":
        case "len" :
            return root_node_to_instruction(node)


        default: Utils.assertNever(node)
    }
}