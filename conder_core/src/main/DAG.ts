import {AnyOpInstance, getOpWriter, Utils, AnyInterpreterTypeInstance} from 'conder_kernel'

// type Node<KIND, DATA={}> = {
//     kind: KIND
//     next?: AnyNode
// } & DATA

type RequiresStoreName = {store: string}
type RequiresValue = {value: AnyInterpreterTypeInstance}
type RequiresNext<K extends keyof NodeInstanceDef> = {next: NodeInstanceDef[K]}
type Node<K extends keyof NodeTypeDefs> = {kind: K} & NodeTypeDefs[K]

export type NodeTypeDefs = {
    return: {},
    select: RequiresStoreName & RequiresNext<"return">,
    append: RequiresStoreName,
    instance: RequiresValue & RequiresNext<"return" | "append">
}
type NodeInstanceDef = {
    [P in keyof NodeTypeDefs]: Node<P>
}
export type AnyNode = NodeInstanceDef[keyof NodeInstanceDef]

const opWriter = getOpWriter()

export function to_instruction(node: AnyNode): AnyOpInstance[] {
    switch (node.kind) {
        case "return":
            return [opWriter.returnStackTop]
        case "select": 
            return [
                
                opWriter.instantiate({}),
                opWriter.queryStore([node.store, {}]),
                ...to_instruction(node.next)
            ]
        
        case "instance":
            return [
                opWriter.instantiate(node.value),
                ...to_instruction(node.next)
            ]
        case "append":
            return [
                opWriter.insertFromStack(node.store)
            ]

        default: Utils.assertNever(node)
    }
}