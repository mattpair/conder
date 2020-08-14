import { MediumController, GCPMediumController } from './state_management/gcpMedium';
import { loadBuildConfig, ConduitBuildConfig } from './config/load';
import { containerize, pushContainer } from './deploy';
import * as fs from 'fs';
import { deployOnToCluster, destroy, createMedium, MediumState, destroyNamespace } from './provisioner';

import {writeRustAndContainerCode, generateModels, generateAllClients, deriveSupportedOperations} from 'conduit_system_writer'
import {compileFiles, CompiledTypes, Utilities} from 'conduit_compiler'

export const conduitsToTypeResolved: Utilities.StepDefinition<{conduits: string[]}, {manifest: CompiledTypes.Manifest}> = {
    stepName: "compiling",
    func: ({conduits}) => {
        const toCompile: Record<string, () => string> = {}
        conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
        return Promise.resolve({manifest: compileFiles(toCompile)})
    }

}

type DependencyFactory = {
    mediumController:() => MediumController
}

const getConduitFileNames: Utilities.StepDefinition<{}, {conduits: string[]}> = {
    stepName: "discovering conduit files",
    func: () => {
        
        function readdirRecursive(currentpath: string): string[] {
            const conduits: string[] = []
            const dirents = fs.readdirSync(currentpath, {withFileTypes: true})
 
            dirents.forEach(ent => {
                if (ent.isDirectory()) {
                    conduits.push(...readdirRecursive(`${currentpath}/${ent.name}`).map(name => `${ent.name}/${name}`))

                } else if (ent.isFile()) {
                    conduits.push(ent.name)
                }               
            })
            return conduits
        }
        const conduits = readdirRecursive("./conduit/")

        if (conduits.length == 0) {
            console.warn(`no files to compile`)
            return
        }
        return Promise.resolve({conduits})
    }
}

const loadMediumForRun: Utilities.StepDefinition<{}, {mediumState: MediumState, mediumController: MediumController}> = {
    stepName: "loading medium state",
    func: ({}) => {
        const match = /^medium=(?<mediumName>.*)$/.exec(process.argv[3])
        if (match === null || !match.groups.mediumName) {
            console.error(`Need to know which medium to run against`)
            process.exit(1)
        }
        const mediumController = new GCPMediumController()
        return new GCPMediumController().get(match.groups.mediumName)
        .then(stateAndFile => ({mediumState: stateAndFile.medium, mediumController}))
    }
}

const deleteDeploymentFromMedium: Utilities.StepDefinition<{buildConf: ConduitBuildConfig}, {}> = {
    stepName: "delete deployment from medium",
    func: ({buildConf}) => {
        const on = /^on=(?<medium>.*)$/.exec(process.argv[4])
        if (!on.groups.medium) {
            console.error(`specify the medium to delete from`)
            process.exit(1)
        }
        const mediumController = new GCPMediumController()
        return mediumController.get(on.groups.medium).then(results => destroyNamespace(results.medium, buildConf.project)).then(() => ({}))
    }

}

export const writeClientFile: Utilities.StepDefinition<{clients: string, buildConf: ConduitBuildConfig}, {}> = {
    stepName: "writing all clients",
    func: ({buildConf, clients}) => {
        const p = []
        for (const dir in buildConf.dependents) {
            p.push(fs.promises.writeFile(`${dir}/clients.ts`, clients))

        }
        return Promise.all(p)
    }
    
}

const commands: Record<string, (dep: DependencyFactory) => void> = {
    async stubs() {
        await new Utilities.Sequence(loadBuildConfig)
        .then(getConduitFileNames)
        .then(conduitsToTypeResolved)
        .then(generateModels)
        .inject({endpoint: "fake-url"})
        .then(generateAllClients)
        .then(writeClientFile)
        .run({})
    },

    async run() {
        await new Utilities.Sequence(loadBuildConfig)
        .then(getConduitFileNames)
        .then(conduitsToTypeResolved)
        .then(loadMediumForRun)
        .then(deriveSupportedOperations)
        .then(writeRustAndContainerCode)
        .then(containerize)
        .then(pushContainer)
        .then(deployOnToCluster)
        .then(generateModels)
        .then(generateAllClients)
        .then(writeClientFile)
        .run({})
        
        console.log("done!")        
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
            await new Utilities.Sequence(loadBuildConfig)
            .then(deleteDeploymentFromMedium)
            .run({})
            

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