import { Utilities } from 'conduit_compiler';
import * as child_process from 'child_process';
import { BackendTypes } from 'conduit_system_writer';
import * as fs from 'fs'

export const containerize: Utilities.StepDefinition<BackendTypes.WrittenCode & { buildConf: BackendTypes.ConduitBuildConfig}, {localContainers: {main: string, postgres: string}}> = {
    stepName: "containerize",
    func: ({buildConf, backend}) => {

        fs.mkdirSync(".deploy/main/src", {recursive: true})
        fs.mkdirSync(".deploy/postgres/startup", {recursive: true})
        return Promise.all([
            ...backend.main.files.map(f => fs.promises.writeFile(f.name, f.content)),
            ...backend.postgres.files.map(f => fs.promises.writeFile(f.name, f.content)),
            fs.promises.writeFile(".deploy/main/Dockerfile", backend.main.docker),
            fs.promises.writeFile(".deploy/postgres/Dockerfile", backend.postgres.docker)
        ]).then(() => {
            const main = `conder-systems/conduit/${buildConf.project}-main`
        

            child_process.execSync(`docker build -t ${main} .`, {cwd: ".deploy/main", stdio: "inherit"})
    
            const postgres = `conder-systems/conduits/${buildConf.project}-postgres`
            child_process.execSync(`docker build -t ${postgres} .`, {cwd: ".deploy/postgres", stdio: "inherit"})

            return{localContainers: {main, postgres}}
        })

    }
}  

export const pushContainer: Utilities.StepDefinition<{localContainers: {main: string, postgres: string}, buildConf: BackendTypes.ConduitBuildConfig}, {remoteContainers: {main: string, postgres: string}}> = {
    stepName: "push container",
    func: ({localContainers, buildConf}) => {
        const main = `us.gcr.io/conder-systems-281115/conduit/${buildConf.project}/main`
        child_process.execSync(`docker tag ${localContainers.main} ${main}`, {cwd: ".deploy/"})
        child_process.execSync(`docker push ${main}`)

        const postgres = `us.gcr.io/conder-systems-281115/conduit/${buildConf.project}/postgres`
        child_process.execSync(`docker tag ${localContainers.postgres} ${postgres}`, {cwd: ".deploy/"})
        child_process.execSync(`docker push ${postgres}`)
        return Promise.resolve({remoteContainers: {main, postgres}})
    }
}


