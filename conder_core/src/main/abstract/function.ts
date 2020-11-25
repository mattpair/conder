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

export type RootNodeCompiler = Compiler<Map<string, FunctionDescription>>

export function toOps(funcs: Map<string, FunctionDescription>, override:  RootNodeCompiler | undefined=undefined): Map<string, AnyOpInstance[]> {
    const ret: Map<string, AnyOpInstance[]> = new Map()
    const compiler: RootNodeCompiler = override ? override : MONGO_GLOBAL_ABSTRACTION_REMOVAL.then(MONGO_COMPILER)
    // const computationLookup: Record<string, RootNode[]> = {}

    // ops.push(...compiler.run(funcs[k].computation))
    funcs.forEach((func, func_name) => {
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
    
    
        ret.set(func_name, ops)
    })

    const compiled = compiler.run(funcs)
    funcs.forEach((func, func_name) => {
        ret.set(func_name, [...ret.get(func_name), ...compiled.get(func_name)])
    })
    return ret
}


export const OPSIFY_MANIFEST = new Transformer<
    Manifest, 
    Manifest<AnyOpInstance[]>>((man) => {
        const funcs = toOps(man.funcs)
        return {
            funcs,
            globals: man.globals
        }
    })