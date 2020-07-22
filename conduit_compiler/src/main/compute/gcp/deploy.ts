import * as child_process from 'child_process';
import { StepDefinition } from '../../util/sequence';


export const containerize: StepDefinition<{codeWritten: true}, {containerized: true}> = {
    stepName: "containerize",
    func: () => {
        child_process.execSync("docker build -t conder-systems/cloud-run-gen .", {cwd: ".deploy/", stdio: "inherit"})
        return Promise.resolve({containerized: true})
    }
}  

export const pushContainer: StepDefinition<{containerized: true}, {remoteContainer: string}> = {
    stepName: "push container",
    func: () => {
        child_process.execSync("docker tag conder-systems/cloud-run-gen us.gcr.io/conder-systems-281115/hello-world-gen", {cwd: ".deploy/"})
        child_process.execSync("docker push us.gcr.io/conder-systems-281115/hello-world-gen")
        return Promise.resolve({remoteContainer: "us.gcr.io/conder-systems-281115/hello-world-gen:latest"})
    }
}


