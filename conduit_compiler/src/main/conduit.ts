import * as fs from 'fs';
import {compileFiles} from "./compileToProto"

function conduitToProto(conduits: string[]): Promise<void[]>  {
    const toCompile: Record<string, () => string> = {}
    conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
    const protos = compileFiles(toCompile)
    fs.mkdirSync(".proto")
    
    const writes = []
    for (const proto in protos) {
        console.log(`writing ${proto}`)
        writes.push(fs.promises.writeFile(`.proto/${proto}`, protos[proto]))
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
        .then(() => console.log("done!"))
        .catch(() => console.log("failed."))
    }    
}

main()

