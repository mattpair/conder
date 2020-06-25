import { ConduitBuildConfig } from './config/load';
import * as child_process from 'child_process';
import { generateClients } from './compute/gcp/clients';
import { generateAndDeploy } from './compute/gcp/deploy';
import {compileFiles} from "./compileToProto"
import { TypeResolved } from './entity/resolved';
import * as fs from 'fs';

// This is just a hack for now. I'm the only one running this.
// Revisit once productionizing.
const DEPENDENCY_DIR = '/Users/jerm/ConderSystems/conduit/conduit_compiler/src/main/deps'

// TODO: work across multiple dirs.
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

const commands = {
    models: (conduits: string[], config: ConduitBuildConfig) => {
        if (!config.dependencies) {
            console.warn("Please specify a dependency in your conduit config so I know where to put models.")
            return
        }
        // TODO: deduplicate
        conduitToProto(conduits)
        .then((results) => {
            for (const dir in config.dependencies) {
                child_process.execSync(`mkdir -p ${dir}/gen/models`)
                child_process.execSync(`touch ${dir}/gen/models/__init__.py`)
                results.forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${dir}/gen/models ${p[0]} 2>&1`, {encoding: "utf-8"}))    
            }
            
            console.log("done!")
        })
        .catch((e) => console.log("failed.", e))

    },

    run: (conduits: string[], config: ConduitBuildConfig) => {
        conduitToProto(conduits)
        .then((results) => {
            if (!config.dependencies) {
                const targetDir = 'python'
                child_process.execSync(`mkdir -p ${targetDir}/gen/models`)
                child_process.execSync(`touch ${targetDir}/gen/models/__init__.py`)
                child_process.execSync(`touch ${targetDir}/gen/__init__.py`)

                results.forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${targetDir}/gen/models ${p[0]} 2>&1`, {encoding: "utf-8"}))
                const url = generateAndDeploy(results.map(p => p[1]), targetDir)
    
                if (config.outputClients !== undefined) {
                    config.outputClients.forEach(outputRequest => {
                        child_process.execSync(`mkdir -p ${outputRequest.dir}/gen/models`)
                        child_process.execSync(`touch ${outputRequest.dir}/gen/models/__init__.py`)
                        child_process.execSync(`touch ${outputRequest.dir}/gen/__init__.py`)
            
                        results.forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${outputRequest.dir}/gen/models ${p[0]} 2>&1`, {encoding: "utf-8"}))
                        generateClients(url, results.map(p => p[1]), outputRequest.dir)
                    })
                }
            }
              
            
            console.log("done!")
        })
    }
}

export function execute(conduits: string[], config: ConduitBuildConfig) {
    const args = process.argv
    const command = args[2]
    console.log(`Command: ${command}`)
    if (!(command in commands)) {
        console.error(`${command} is invalid.\n\nOptions are ${JSON.stringify(Object.values(commands))}`)
    }

    //@ts-ignore
    commands[command](conduits, config)
}