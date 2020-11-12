import { AnySchemaInstance, AnyOpInstance, ow } from "conder_kernel";
import { AnyNode, RootNode } from "./IR";
import {MONGO_COMPILER, MONGO_GLOBAL_ABSTRACTION_REMOVAL} from './globals/mongo'

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
    const compiler = MONGO_GLOBAL_ABSTRACTION_REMOVAL.then(MONGO_COMPILER)

    ops.push(...func.computation.flatMap(c => compiler.run(c)))
    return ops
}