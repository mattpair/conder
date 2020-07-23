import * as child_process from 'child_process';
import { StepDefinition } from '../../util/sequence';
import { ConduitBuildConfig } from 'config/load';


export const containerize: StepDefinition<{codeWritten: true, buildConf: ConduitBuildConfig}, {localContainers: {main: string}}> = {
    stepName: "containerize",
    func: ({buildConf}) => {
        const main = `conder-systems/conduit/${buildConf.project}-main`
        child_process.execSync(`docker build -t ${main} .`, {cwd: ".deploy/", stdio: "inherit"})
        return Promise.resolve({localContainers: {main}})
    }
}  

export const pushContainer: StepDefinition<{localContainers: {main: string}, buildConf: ConduitBuildConfig}, {remoteContainers: {main: string}}> = {
    stepName: "push container",
    func: ({localContainers, buildConf}) => {
        const main = `us.gcr.io/conder-systems-281115/conduit/${buildConf.project}/main`
        child_process.execSync(`docker tag ${localContainers.main} ${main}`, {cwd: ".deploy/"})
        child_process.execSync(`docker push ${main}`)
        return Promise.resolve({remoteContainers: {main}})
    }
}


