import * as fs from 'fs'
import * as child_process from 'child_process'
import { generateServer } from './src/main/server_writer'

module.exports.containerize = function () {
    fs.mkdirSync("./src/rust/src/", {recursive: true})
    fs.writeFileSync("./src/rust/src/main.rs", generateServer())
    child_process.execSync(`docker build -t kernel-server .`, {cwd: "./src/rust", stdio: "inherit"})
}