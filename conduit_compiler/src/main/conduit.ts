import { isError } from './error/types';
import * as fs from 'fs';
import { loadBuildConfig } from './config/load';
import { execute } from './cli';
import * as container from '@google-cloud/container'


class GoogleCloudProvisioner {
    readonly client: container.v1.ClusterManagerClient
    readonly projectId: string
    readonly zone: string
    readonly clusterId: string

    constructor(client: container.v1.ClusterManagerClient, proj: string, zone: string, clusterId: string) {
        this.projectId = proj
        this.client = client
        this.zone = zone
        this.clusterId = clusterId
    }

    
    async waitForOperation(op: container.protos.google.container.v1.IOperation) {
        while (["RUNNING", "PENDING"].includes(op.status as string)) {
            console.log(`...waiting for operation ${op.name} ${op.operationType}:\t${op.statusMessage || op.status}...`)
            await new Promise(resolve => setTimeout(resolve, 5000))
            op = (await this.client.getOperation({
                projectId: this.projectId, zone: this.zone, operationId: op.name
            }))[0]
        }
    }

    deploy(): Promise<container.protos.google.container.v1.ICluster>{
        console.log("Deploying cluster")
        return this.client.createCluster({
            projectId: this.projectId,
            zone: this.zone,
            cluster: {
                name: this.clusterId,
                description: "proof of concept",
                initialNodeCount: 1,
                // nodeConfig: {
    
                // },
    
            }
    
        }).then(async (out) => {
            await this.waitForOperation(out[0])
            return out[1]
        })
    }

    teardown() {
        console.log("deleting cluster")
        return this.client.deleteCluster({
            projectId: this.projectId,
            zone: this.zone,
            clusterId: this.clusterId,
        }).then(async (out) => {
            await this.waitForOperation(out[0])
            console.log("deleted!")
        })
        
    }
}

async function testing() {
    const client = new container.v1.ClusterManagerClient()
    const projectId = await client.getProjectId()
    const zone =  "us-west1-a"
    const clusterId = "test-cluster"
    const provisioner =  new GoogleCloudProvisioner(client, projectId, zone, clusterId)
    
    await provisioner.deploy().finally(() => provisioner.teardown())
}

testing().catch(console.error)

// function main() {
//     let conduits: string[]

//     const config = loadBuildConfig()
//     if (isError(config)) {
//         console.error(config.description)
//         return
//     }

//     try {
//         conduits = fs.readdirSync("./conduit/")
//     } catch(e) {
//         console.error("Unable to find ./conduit/")
//         return
//     }

//     if (conduits.length == 0) {
//         console.warn("no files to compile")
//     } else {
//         execute(conduits, config)
//     }    
// }

// main()

