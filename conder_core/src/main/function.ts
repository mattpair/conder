import { AnySchemaInstance, AnyOpInstance, ow } from "conder_kernel";
import { AnyNode , compile} from "./DAG";


export type FunctionDescription = {
    input: AnySchemaInstance[]
    computation: AnyNode[]
}

export function toOps(func: FunctionDescription): AnyOpInstance[] {
    const ops: AnyOpInstance[] = [
        ow.assertHeapLen(func.input.length)
    ]
    func.input.forEach((schema, index) => {
        ops.push(
            ow.enforceSchemaInstanceOnHeap({heap_pos: index, schema}),
            ow.conditionalOpOffset(2),
            ow.raiseError("invalid input")
        )
    })
    ops.push(...compile(...func.computation))
    return ops
}