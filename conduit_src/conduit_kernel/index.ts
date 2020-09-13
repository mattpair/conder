import * as fs from 'fs'
import * as child_process from 'child_process'
import { generateServer } from './src/main/server_writer'
import { CompleteOpWriter, OpSpec, OpInstance } from './src/main/interpreter/supported_op_definition'


function writeMain() {
    fs.mkdirSync("./src/rust/src/", {recursive: true})
    fs.writeFileSync("./src/rust/src/main.rs", generateServer())
}
module.exports.writeMain = writeMain

module.exports.containerize = function () {
    writeMain()
    child_process.execSync(`docker build -t kernel-server .`, {cwd: "./src/rust", stdio: "inherit"})
}

export function getOpWriter(): CompleteOpWriter {
    const ret: Partial<CompleteOpWriter> = {}
    for (const kind in OpSpec) {
        //@ts-ignore
        ret[kind] = OpSpec[kind].factoryMethod
    }
    return ret as CompleteOpWriter
}

export type Procedures = Record<string, OpInstance[]>

export { interpeterTypeFactory } from './src/main/interpreter/interpreter_writer'