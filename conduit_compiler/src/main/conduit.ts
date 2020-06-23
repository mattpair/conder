import * as fs from 'fs';
import * as child_process from 'child_process';
import {compileFiles} from "./compileToProto"

// This is just a hack for now. I'm the only one running this.
// Revisit once productionizing.
const DEPENDENCY_DIR = '/Users/jerm/ConderSystems/conduit/conduit_compiler/src/main/deps'

function conduitToProto(conduits: string[]): Promise<string[]>  {
    const toCompile: Record<string, () => string> = {}
    conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
    const protos = compileFiles(toCompile)
    fs.mkdirSync(".proto")
    
    const writes: Promise<string>[] = []
    for (const proto in protos) {
        writes.push(fs.promises.writeFile(`.proto/${proto}`, protos[proto]).then(r => proto))
    }
    if (writes.length == 0) {
        console.warn("Did not find any message types in conduit/")
    }

    return Promise.all(writes)
}

function main() {
    let conduits: string[]
    try {
        conduits = fs.readdirSync("./conduit/")
    } catch(e) {
        console.error("Unable to find ./conduit/")
        return
    }

    if (conduits.length == 0) {
        console.warn("no files to compile")
    } else {
        conduitToProto(conduits)
        .then((protos) => {
            console.log("done!")
            child_process.execSync('mkdir -p python/models')
            child_process.execSync('touch python/models/__init__.py')
            protos.forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=python/models ${p} 2>&1`, {encoding: "utf-8"}))
        })
        .catch((e) => console.log("failed.", e))
    }    
}

main()

