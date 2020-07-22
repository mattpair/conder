import { Sequence } from './util/sequence';
import { MediumController, GCPMediumController } from './state_management/gcpMedium';
import { loadBuildConfig } from './config/load';
import { writeRustAndContainerCode, containerize, pushContainer } from './compute/gcp/deploy';
import {compileFiles} from "./compile"
import { FunctionResolved } from './entity/resolved';
import * as fs from 'fs';
import { deployOnToCluster, destroy, createMedium, MediumState, destroyNamespace } from './deploy/gcp/provisioner';
import { isError } from './error/types';
import { generateModels, generateModelsAndClients, generateModelsToDirectory } from './models/generate';


async function compile(conduits: string[]): Promise<FunctionResolved.Manifest>  {
    const toCompile: Record<string, () => string> = {}
    conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
    return compileFiles(toCompile)

}

type DependencyFactory = {
    mediumController:() => MediumController
}

const commands: Record<string, (dep: DependencyFactory) => void> = {
    async models() {
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
        if (!config.dependents) {
            console.warn("Please specify a dependent in your conduit config so I know where to put models.")
            return
        }
        await compile(conduits)
        .then(async (manifest) => {
            await generateModels(manifest, config)
            
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
                .then(async (manifest) => {
        
                    console.log("containerizing")
                    const out = await new Sequence(writeRustAndContainerCode).then(containerize).then(pushContainer).run({manifest})
                    console.log("deploying to medium")
                    const url = await deployOnToCluster(med, manifest, out.remoteContainer, config.project)
                                
                    console.log("generating clients")
                    generateModelsAndClients(manifest, config, url)
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