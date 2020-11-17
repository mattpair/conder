import * as fs from 'fs'
import * as child_process from 'child_process'
import { generateServer, StrongServerEnv, ServerEnv, Var } from './server_writer'
import { CompleteOpWriter, OpSpec, OpInstance,  } from './interpreter/supported_op_definition'
import { interpeterTypeFactory,  AnyInterpreterTypeInstance} from './interpreter/interpreter_writer'
import * as mongodb from "mongodb";

function writeMain() {
    fs.mkdirSync("./src/main/ops/rust/src/", {recursive: true})
    fs.writeFileSync("./src/main/ops/rust/src/main.rs", generateServer())
}
module.exports.writeMain = writeMain


export const ow = getOpWriter()
function getOpWriter(): CompleteOpWriter {
    const ret: Partial<CompleteOpWriter> = {}
    for (const kind in OpSpec) {
        //@ts-ignore
        const inst: any = OpSpec[kind] 
        
        if (inst.factoryMethod) {
            //@ts-ignore
            ret[kind] = inst.factoryMethod
        } else {
            //@ts-ignore
            ret[kind] = {kind, data: undefined}
        }
        
    }
    return ret as CompleteOpWriter
}

export {AnyOpInstance, CompleteOpWriter} from './interpreter/supported_op_definition'
export type Procedures = Record<string, OpInstance[]>


export { interpeterTypeFactory, InterpreterTypeInstanceMap, AnyInterpreterTypeInstance  } from './interpreter/interpreter_writer'
export {ServerEnv, EnvVarType, Var, StrongServerEnv, RequiredEnv} from './server_writer'
export * from './local_run/utilities'
export * from './SchemaFactory'
export * as Utils from './utils'