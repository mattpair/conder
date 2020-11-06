import { AnySchemaInstance, AnyOpInstance, ow } from "conder_kernel";
import { AnyNode } from "./IR";
import {global_elaboration, complete_compiler} from './ir_to_instruction'

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

    const compile_ready = func.computation.flatMap(global_elaboration)
    
    ops.push(...compile_ready.flatMap(n => 
        //@ts-ignore
        complete_compiler[n.kind](n)))
    return ops
}