import { ConduitBuildConfig } from './config/load';
import * as child_process from 'child_process';
import { generateClients } from './compute/gcp/clients';
import { containerize } from './compute/gcp/deploy';
import {compileFiles} from "./compile"
import { FunctionResolved } from './entity/resolved';
import * as fs from 'fs';
import { deployOnToCluster, destroy, createMedium, MediumState } from './deploy/gcp/provisioner';

// This is just a hack for now. I'm the only one running this.
// Revisit once productionizing.
const DEPENDENCY_DIR = '/Users/jerm/ConderSystems/conduit/conduit_compiler/src/main/deps'

// TODO: work across multiple dirs.
function compile(conduits: string[]): Promise<[string[], FunctionResolved.Manifest]>  {
    const toCompile: Record<string, () => string> = {}
    conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
    const [proto, manifest] = compileFiles(toCompile)
    fs.mkdirSync(".proto")
    
    const writes: Promise<string>[] = []
    for (const filename in proto) {
        writes.push(fs.promises.writeFile(`.proto/${filename}`, proto[filename].proto).then(r => filename))
    }
    if (writes.length == 0) {
        console.warn("Did not find any message types in conduit/")
    }

    return Promise.all(writes).then((filenames) => ([filenames,manifest]))
}

const commands = {
    models: (conduits: string[], config: ConduitBuildConfig) => {
        if (!config.dependencies) {
            console.warn("Please specify a dependency in your conduit config so I know where to put models.")
            return
        }
        // TODO: deduplicate
        compile(conduits)
        .then((filenamesAndManifest) => {
            for (const dir in config.dependencies) {
                child_process.execSync(`mkdir -p ${dir}/gen/models`)
                child_process.execSync(`touch ${dir}/gen/models/__init__.py`)
                filenamesAndManifest[0].forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${dir}/gen/models ${p} 2>&1`, {encoding: "utf-8"}))    
            }
            
            console.log("done!")
        })
        .catch((e) => console.log("failed.", e))

    },

    async run(conduits: string[], config: ConduitBuildConfig) {
        const match = /^medium=(?<mediumName>.*)$/.exec(process.argv[3])
        if (match === null || !match.groups.mediumName) {
            console.error(`Need to know which medium to run against`)
            return
        }

        const med: MediumState = JSON.parse(fs.readFileSync(`${STATE_DIR}/mediums/${match.groups.mediumName}.json`, {encoding: "utf-8"}))
        compile(conduits)
        .then(async (results) => {
            if (!config.dependencies) {
                const targetDir = '.python'
                child_process.execSync(`mkdir -p ${targetDir}/gen/models`)
                child_process.execSync(`touch ${targetDir}/gen/models/__init__.py`)
                child_process.execSync(`touch ${targetDir}/gen/__init__.py`)

                results[0].forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${targetDir}/gen/models ${p} 2>&1`, {encoding: "utf-8"}))
                const image = containerize(results[1], targetDir)
                const url = await deployOnToCluster(med,results[1].service.name, image)
    
                if (config.outputClients !== undefined) {
                    config.outputClients.forEach(outputRequest => {
                        child_process.execSync(`mkdir -p ${outputRequest.dir}/gen/models`)
                        child_process.execSync(`touch ${outputRequest.dir}/gen/models/__init__.py`)
                        child_process.execSync(`touch ${outputRequest.dir}/gen/__init__.py`)
            
                        results[0].forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${outputRequest.dir}/gen/models ${p} 2>&1`, {encoding: "utf-8"}))
                        generateClients(url, results[1], outputRequest.dir)
                    })
                }
            }
              
            
            console.log("done!")
        })
    },
    async destroy(conduits: string[], config: ConduitBuildConfig) {
        if (process.argv[3] === 'medium') {
            if (!process.argv[4]) {
                console.error(`Medium requires a name`)
                return
            }

            await destroy(JSON.parse(fs.readFileSync(`${STATE_DIR}/mediums/${process.argv[4]}.json`, {encoding: "utf-8"})))
        }
        
    },

    async create(conduits: string[], config: ConduitBuildConfig) {
        if (process.argv[3] === 'medium') {
            if (!process.argv[4]) {
                console.error(`Medium requires a name`)
                return
            }

            await createMedium(process.argv[4]).then((med) => {
                fs.writeFileSync(`${STATE_DIR}/mediums/${process.argv[4]}.json`, JSON.stringify(med))
            })
        } else {
            console.error(`Don't know how to create: ${process.argv[3]}`)
        }
    },
}
const STATE_DIR = child_process.execSync("echo $CONDUIT_STATE_DIR", {encoding: "utf-8"}).trim()
console.log(`State dir: ${STATE_DIR}`)
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