import * as fs from 'fs'
import * as child_process from 'child_process'
import { generateServer, StrongServerEnv, ServerEnv, Var } from './src/main/server_writer'
import { CompleteOpWriter, OpSpec, OpInstance,  } from './src/main/interpreter/supported_op_definition'
import { interpeterTypeFactory,  AnyInterpreterTypeInstance} from './src/main/interpreter/interpreter_writer'
import * as mongodb from "mongodb";

function writeMain() {
    fs.mkdirSync("./src/rust/src/", {recursive: true})
    fs.writeFileSync("./src/rust/src/main.rs", generateServer())
}
module.exports.writeMain = writeMain

module.exports.containerize = function () {
    writeMain()
    console.log("PWD", process.cwd())
    child_process.execSync(`docker build -t us.gcr.io/conder-systems-281115/kernel-server:latest . && docker push us.gcr.io/conder-systems-281115/kernel-server:latest`, {cwd: "./src/rust", stdio: "inherit"})
}

export function getOpWriter(): CompleteOpWriter {
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

export {AnyOpInstance, CompleteOpWriter} from './src/main/interpreter/supported_op_definition'
export type Procedures = Record<string, OpInstance[]>


export { interpeterTypeFactory, InterpreterTypeInstanceMap, AnyInterpreterTypeInstance  } from './src/main/interpreter/interpreter_writer'
export {ServerEnv, EnvVarType, Var, StrongServerEnv, RequiredEnv} from './src/main/server_writer'
export * from './src/main/local_run/utilities'
export * from './src/main/SchemaFactory'
export * as Utils from './src/main/utils'