import { AnySchemaInstance, AnyOpInstance, ow } from '../ops/index';
import { AnyNode, AnyRootNodeFromSet, BaseNodeDefs, RootNode } from "./IR";
import {MONGO_COMPILER, MONGO_GLOBAL_ABSTRACTION_REMOVAL} from './globals/mongo'
import { Transformer, Compiler } from "./compilers";


export type GlobalObject = {kind: "glob", name: string}

export type Manifest<F=FunctionDescription> = {
    globals: Map<string, GlobalObject>
    funcs: Map<string, F>
}

export type FunctionDescription = {
    input: AnySchemaInstance[]
    computation: RootNode[]
}

export type RootNodeCompiler = Compiler<RootNode[]>

export function toOps(func: FunctionDescription, override:  RootNodeCompiler | undefined=undefined): AnyOpInstance[] {
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
    const compiler: RootNodeCompiler = override ? override : MONGO_GLOBAL_ABSTRACTION_REMOVAL.then(MONGO_COMPILER)

    ops.push(...compiler.run(func.computation))
    return ops
}


export const OPSIFY_MANIFEST = new Transformer<
    Manifest, 
    Manifest<AnyOpInstance[]>>((man) => {
        const funcs = new Map<string, AnyOpInstance[]>()
        man.funcs.forEach((v, k) => {
            funcs.set(k, toOps(v)) 
        })
        return {
            funcs,
            globals: man.globals
        }
    })