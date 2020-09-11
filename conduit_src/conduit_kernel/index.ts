import * as fs from 'fs'
import * as child_process from 'child_process'
import { generateServer } from './src/main/server_writer'

function compile() {
    fs.mkdirSync("./src/rust/src/", {recursive: true})
    fs.writeFileSync("./src/rust/src/main.rs", generateServer())
    child_process.execSync(`cargo build --release`, {cwd: "./src/rust", stdio: "inherit"})
    child_process.execSync(`docker build -t kernel-server .`, {cwd: "./src/rust", stdio: "inherit"})
}

module.exports.compile = compile