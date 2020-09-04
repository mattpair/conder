import { ForeignInstallResults } from 'conduit_foreign_install';
import { Utilities, ConduitBuildConfig } from 'conduit_parser';
import * as child_process from 'child_process';
import { BackendTypes } from 'conduit_kernel_writer';
import * as fs from 'fs'
type VariableContainerDetails = {container_name: string, desired_service_name: string}
type ContainerSet = {main: string, postgres: string, foreignContainers: VariableContainerDetails[]}

type LocalContainers = {localContainers: ContainerSet}

function forEachStaticContainer(f: (k: Exclude<keyof ContainerSet, "foreignContainers">) => any): void {
    ["main", "postgres"].forEach(f)
}
export const containerize: Utilities.StepDefinition<BackendTypes.WrittenCode & { buildConf: ConduitBuildConfig} & ForeignInstallResults, LocalContainers> = {
    stepName: "containerize",
    func: ({buildConf, backend, foreignContainerInstr}) => {

        function localContainerName(unique: string): string {
            return `conder-systems/conduit/${buildConf.project}-${unique}`
        }

        fs.mkdirSync(".deploy/main/src", {recursive: true})
        fs.mkdirSync(".deploy/postgres/startup", {recursive: true})
        return Promise.all([
            ...backend.main.files.map(f => fs.promises.writeFile(f.name, f.content)),
            ...backend.postgres.files.map(f => fs.promises.writeFile(f.name, f.content)),
            fs.promises.writeFile(".deploy/main/Dockerfile", backend.main.docker),
            fs.promises.writeFile(".deploy/postgres/Dockerfile", backend.postgres.docker),
        ]).then(() => {
            const localContainers: Partial<ContainerSet> = {}
            forEachStaticContainer((k) => {
                const name = localContainerName(k)
                child_process.execSync(`docker build -t ${name} .`, {cwd: `.deploy/${k}`, stdio: "inherit"})
                localContainers[k] = name
            })
            
            localContainers.foreignContainers = foreignContainerInstr.map(instr => {
                const name = localContainerName(instr.name_service)
                child_process.execSync(`docker build -t ${name} .`, {cwd: instr.dockerfile_dir, stdio: "inherit"})
                return {container_name: name, desired_service_name: instr.name_service}
            })

            return{localContainers} as LocalContainers
        })

    }
}  

export type RemoteContainers = {remoteContainers: ContainerSet}
export const pushContainer: Utilities.StepDefinition<LocalContainers & {buildConf: ConduitBuildConfig}, RemoteContainers> = {
    stepName: "push container",
    func: ({localContainers, buildConf}) => {

        function remoteContainerName(unique: string): string {
            return `us.gcr.io/conder-systems-281115/conduit/${buildConf.project}/${unique}`
        }
        const remoteContainers: Partial<ContainerSet> = {}
        function push(key: string, localname: string): string {
            const name = remoteContainerName(key)
            child_process.execSync(`docker tag ${localname} ${name}`, {cwd: ".deploy/"})
            child_process.execSync(`docker push ${name}`)
            return name
        }

        forEachStaticContainer(key => remoteContainers[key] = push(key, localContainers[key]))
        remoteContainers.foreignContainers = localContainers.foreignContainers.map(f => {
            const name = push(f.desired_service_name, f.container_name)
            return {container_name: name, desired_service_name: f.desired_service_name}
        })
        
        return Promise.resolve({remoteContainers} as RemoteContainers) 
    }
}

