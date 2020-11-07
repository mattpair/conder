import { AnySchemaInstance, AnyOpInstance, ow } from "conder_kernel";
import { AnyNode, RootNode } from "./IR";
import {complete_compiler} from './ir_to_instruction'

export type FunctionDescription = {
    input: AnySchemaInstance[]
    computation: RootNode[]
}

export function toOps(func: FunctionDescription): AnyOpInstance[] {
    const ops: AnyOpInstance[] = [
        ow.assertHeapLen(func.input.length)
    ]
    func.input.forEach((schema, index) => {
        ops.push(
            ow.enforceSchemaInstanceOnHeap({heap_pos: index, schema}),
            ow.conditonallySkipXops(1),
            ow.raiseError("invalid input")
        )
    })

    ops.push(...func.computation.flatMap(n => 
        //@ts-ignore
        complete_compiler[n.kind](n)))
    return ops
}