import { AnySchemaInstance, AnyOpInstance, ow } from "conder_kernel";
import { to_instr } from "./ir_to_instruction";
import { AnyNode } from "./IR";
import { global_elaboration } from "./storage/mongo";

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
            ow.conditonallySkipXops(1),
            ow.raiseError("invalid input")
        )
    })

    const compile_ready = global_elaboration(...func.computation)
    ops.push(...compile_ready.flatMap(n => to_instr(n)))
    return ops
}