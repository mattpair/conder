import {FUNCTION_TRANSFORMER, FunctionDescription, Transformer ,Compiler} from 'conder_core'
import {Parser} from './parser'
import {semantify, Manifest} from './semantics'

export const TUNA_TO_MANIFEST = new Transformer<string, Manifest>(str => {
    const p = new Parser(str).parse()
    return semantify(p)
})