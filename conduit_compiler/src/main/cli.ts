import { ConduitBuildConfig, loadBuildConfig } from './config/load';
import * as child_process from 'child_process';
import { generateClients } from './compute/gcp/clients';
import { containerize } from './compute/gcp/deploy';
import {compileFiles} from "./compile"
import { FunctionResolved } from './entity/resolved';
import * as fs from 'fs';
import { deployOnToCluster, destroy, createMedium, MediumState, destroyNamespace } from './deploy/gcp/provisioner';
import { isError } from './error/types';


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

const commands: Record<string, () => void> = {
    models() {
        const config = loadBuildConfig()
        if (isError(config)) {
            console.error(config.description)
            return
        }
        let conduits: string[] = []
        try {
            conduits = fs.readdirSync("./conduit/")
        } catch(e) {
            console.error("Unable to find ./conduit/")
            return
        }

        if (conduits.length == 0) {
            console.warn("no files to compile")
            return
        }
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

    async run() {
        const config = loadBuildConfig()
        if (isError(config)) {
            console.error(config.description)
            return
        }
        let conduits: string[] = []
        try {
            conduits = fs.readdirSync("./conduit/")
        } catch(e) {
            console.error("Unable to find ./conduit/")
            return
        }

        if (conduits.length == 0) {
            console.warn("no files to compile")
            return
        }

        const match = /^medium=(?<mediumName>.*)$/.exec(process.argv[3])
        if (match === null || !match.groups.mediumName) {
            console.error(`Need to know which medium to run against`)
            return
        }

        const med: MediumState = JSON.parse(fs.readFileSync(`${STATE_DIR}/mediums/${match.groups.mediumName}.json`, {encoding: "utf-8"}))
        console.log("compiling conduit files")
        compile(conduits)
        .then(async (results) => {
            if (!config.dependencies) {
                const targetDir = '.python'
                child_process.execSync(`mkdir -p ${targetDir}/gen/models`)
                child_process.execSync(`touch ${targetDir}/gen/models/__init__.py`)
                child_process.execSync(`touch ${targetDir}/gen/__init__.py`)
                console.log("generating models from proto")
                results[0].forEach(p => child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${targetDir}/gen/models ${p} 2>&1`, {encoding: "utf-8"}))
                console.log("containerizing")
                const image = containerize(results[1], targetDir)
                console.log("deploying to medium")
                const url = await deployOnToCluster(med,results[1].service.name, image, config.project)
    
                if (config.outputClients !== undefined) {
                    console.log("generating clients")
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

    async destroy() {
        const match = /^(?<entityType>(medium|deployment))/.exec(process.argv[3])
        
        if (match === null || !match.groups.entityType) {
            console.error("Must specify entity type to delete")
            process.exit(1)
        }
        if (match.groups.entityType === "medium") {
            if (!process.argv[4]) {
                console.error("please specify medium to delete")
                process.exit(1)
            }

            await destroy(JSON.parse(fs.readFileSync(`${STATE_DIR}/mediums/${process.argv[4]}.json`, {encoding: "utf-8"})))
        } else if (match.groups.entityType === "deployment") {
            const config = loadBuildConfig()
            if (isError(config)) {
                console.error(config.description)
                process.exit(1)
            }
            //to-do parameterize
            destroyNamespace(JSON.parse(fs.readFileSync(`${STATE_DIR}/mediums/test-medium.json`, {encoding: "utf-8"})), config.project)
            
        } else {
            console.error(`unable to handle ${match.groups.entityType}`)
        }
    },

    async create() {
        
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

    async has() {
        const match = /^medium=(?<mediumName>.*)$/.exec(process.argv[3])
        if (match === null || !match.groups.mediumName) {
            console.error(`Need to know which medium to look for`)
            process.exit(1)
        }

        if (fs.existsSync(`${STATE_DIR}/mediums/${match.groups.mediumName}.json`)) {
            console.log(`have ${match.groups.mediumName}`)
            process.exit(0)
        }
        console.warn("medium does not exist")
        process.exit(1)
    }
}
const STATE_DIR = child_process.execSync("echo $CONDUIT_STATE_DIR", {encoding: "utf-8"}).trim()
console.log(`State dir: ${STATE_DIR}`)

export function execute() {
    const args = process.argv
    const command = args[2]
    console.log(`Command: ${command}`)
    if (!(command in commands)) {
        console.error(`${command} is invalid.\n\nOptions are ${JSON.stringify(Object.values(commands))}`)
    }

    commands[command]()
}