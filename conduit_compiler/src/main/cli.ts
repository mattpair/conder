import { MediumController, GCPMediumController } from './state_management/gcpMedium';
import { loadBuildConfig } from './config/load';
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

type DependencyFactory = {
    mediumController:() => MediumController
}

const commands: Record<string, (dep: DependencyFactory) => void> = {
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

    async run(dep: DependencyFactory) {
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
        
        await dep.mediumController().get(match.groups.mediumName).then(result => {
            const med: MediumState = result.medium
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
            })
        
        
    },

    async destroy(dep: DependencyFactory) {
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
    

            await dep.mediumController().delete(process.argv[4], destroy)
        
        } else if (match.groups.entityType === "deployment") {
            const config = loadBuildConfig()
            if (isError(config)) {
                console.error(config.description)
                process.exit(1)
            }
            const on = /^on=(?<medium>.*)$/.exec(process.argv[4])
            if (!on.groups.medium) {
                console.error(`specify the medium to delete from`)
                process.exit(1)
            }
            await dep.mediumController().get(on.groups.medium).then(results => destroyNamespace(results.medium, config.project))

        } else {
            console.error(`unable to handle ${match.groups.entityType}`)
        }
    },

    async create(dep: DependencyFactory) {
        
        if (process.argv[3] === 'medium') {
            if (!process.argv[4]) {
                console.error(`Medium requires a name`)
                return
            }

            await createMedium(process.argv[4]).then((med) => dep.mediumController().save(process.argv[4], med))
        } else {
            console.error(`Don't know how to create: ${process.argv[3]}`)
        }
    },

    async has(dep: DependencyFactory) {
        const match = /^medium=(?<mediumName>.*)$/.exec(process.argv[3])
        if (match === null || !match.groups.mediumName) {
            console.error(`Need to know which medium to look for`)
            process.exit(1)
        }
        
        await dep.mediumController().tryGet(match.groups.mediumName).then(maybeFile => {
            if (maybeFile) {
                console.log(`have ${match.groups.mediumName}`)
                process.exit(0)
            }
            return Promise.reject(`Cannot find medium ${match.groups.mediumName}`)
        }).catch(err => {
            console.error("Failure locating medium:", err)
            process.exit(1)
        })
    }
}

export function execute() {
    const args = process.argv
    const command = args[2]
    if (!(command in commands)) {
        console.error(`${command} is invalid.\n\nOptions are ${JSON.stringify(Object.values(commands))}`)
    }

    commands[command]({mediumController: () => new GCPMediumController()})
}