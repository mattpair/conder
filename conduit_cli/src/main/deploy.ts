import * as child_process from 'child_process';
import { StepDefinition } from './util/sequence';
import { ConduitBuildConfig } from './config/load';


export const containerize: StepDefinition<{codeWritten: {main: string, postgres: string}, buildConf: ConduitBuildConfig}, {localContainers: {main: string, postgres: string}}> = {
    stepName: "containerize",
    func: ({buildConf, codeWritten}) => {
        const main = `conder-systems/conduit/${buildConf.project}-main`
        child_process.execSync(`docker build -t ${main} .`, {cwd: codeWritten.main, stdio: "inherit"})

        const postgres = `conder-systems/conduits/${buildConf.project}-postgres`
        child_process.execSync(`docker build -t ${postgres} .`, {cwd: codeWritten.postgres, stdio: "inherit"})
        return Promise.resolve({localContainers: {main, postgres}})
    }
}  

export const pushContainer: StepDefinition<{localContainers: {main: string, postgres: string}, buildConf: ConduitBuildConfig}, {remoteContainers: {main: string, postgres: string}}> = {
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


