import * as fs from 'fs'
import * as child_process from 'child_process'
import { generateServer } from './src/main/server_writer'

function writeMain() {
    fs.mkdirSync("./src/rust/src/", {recursive: true})
    fs.writeFileSync("./src/rust/src/main.rs", generateServer())
}
module.exports.writeMain = writeMain

module.exports.containerize = function () {
    writeMain()
    child_process.execSync(`docker build -t kernel-server .`, {cwd: "./src/rust", stdio: "inherit"})
}