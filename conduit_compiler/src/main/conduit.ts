import { isError } from './error/types';
import { TypeResolved } from './entity/resolved';
import * as fs from 'fs';
import * as child_process from 'child_process';
import {compileFiles} from "./compileToProto"
import { generateAndDeploy } from './compute/gcp/deploy';
import { loadBuildConfig } from './config/load';
import { generateClients } from './compute/gcp/clients';

// This is just a hack for now. I'm the only one running this.
// Revisit once productionizing.
const DEPENDENCY_DIR = '/Users/jerm/ConderSystems/conduit/conduit_compiler/src/main/deps'

function conduitToProto(conduits: string[]): Promise<[string, TypeResolved.File][]>  {
    const toCompile: Record<string, () => string> = {}
    conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
    const partiallyCompileds = compileFiles(toCompile)
    fs.mkdirSync(".proto")
    
    const writes: Promise<[string, TypeResolved.File]>[] = []
    for (const filename in partiallyCompileds) {
        writes.push(fs.promises.writeFile(`.proto/${filename}`, partiallyCompileds[filename].proto).then(r => [filename, partiallyCompileds[filename].data]))
    }
    if (writes.length == 0) {
        console.warn("Did not find any message types in conduit/")
    }

    return Promise.all(writes)
}

function main() {
    let conduits: string[]

    const config = loadBuildConfig()
    if (isError(config)) {
        console.error(config.description)
        return
    }

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
        .then((results) => {
            console.log("done!")
            child_process.execSync('mkdir -p python/models')
            child_process.execSync('touch python/models/__init__.py')
            results.forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=python/models ${p[0]} 2>&1`, {encoding: "utf-8"}))
            const url = generateAndDeploy(results.map(p => p[1]))

            if (config.outputClients !== undefined) {
                config.outputClients.forEach(outputRequest => {
                    child_process.execSync(`mkdir -p ${outputRequest.dir}/gen/models`)
                    child_process.execSync(`touch ${outputRequest.dir}/gen/models/__init__.py`)
                    child_process.execSync(`touch ${outputRequest.dir}/gen/__init__.py`)
        
                    results.forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${outputRequest.dir}/gen/models ${p[0]} 2>&1`, {encoding: "utf-8"}))
                    generateClients(url, results.map(p => p[1]), outputRequest.dir)
                })
            }
            

        })
        .catch((e) => console.log("failed.", e))
    }    
}

main()

