import {AnyOpInstance, getOpWriter, Utils} from 'conder_kernel'

export type Action = {
    kind: "return"
}

export type Select = {
    kind: "select", 
    store: string,
    after: Action
}

export type Node = Action | Select
const opWriter = getOpWriter()

export function to_instruction(node: Node): AnyOpInstance[] {
    switch (node.kind) {
        case "return":
            return [opWriter.returnStackTop]
        case "select": 
            return [
                opWriter.instantiate({}),
                opWriter.queryStore([node.store, {}]),
                ...to_instruction(node.after)
            ]

        default: Utils.assertNever(node)
    }
}