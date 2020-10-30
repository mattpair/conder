import {AnyOpInstance, getOpWriter, Utils, AnyInterpreterTypeInstance} from 'conder_kernel'

export type Action = {
    kind: "return"
}

export type Select = {
    kind: "select", 
    store: string,
    next: Action
}

export type Append = {
    kind: "append",
    store: string
}

export type Instantiate = {
    kind: "inst"
    value: AnyInterpreterTypeInstance
    next: Node
}

export type Node = Action | Select | Append | Instantiate
const opWriter = getOpWriter()

export function to_instruction(node: Node): AnyOpInstance[] {
    switch (node.kind) {
        case "return":
            return [opWriter.returnStackTop]
        case "select": 
            return [
                opWriter.instantiate({}),
                opWriter.queryStore([node.store, {}]),
                ...to_instruction(node.next)
            ]
        
        case "inst":
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