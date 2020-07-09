import { isError } from './error/types';
import * as fs from 'fs';
import { loadBuildConfig } from './config/load';
import { execute } from './cli';
import * as container from '@google-cloud/container'
import * as k8s from '@kubernetes/client-node'


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

    async deploy(): Promise<container.protos.google.container.v1.ICluster> {
        console.log("Deploying cluster")
        return this.client.createCluster({
            projectId: this.projectId,
            zone: this.zone,
            cluster: {
                name: this.clusterId,
                description: "proof of concept",
                masterAuth: {
                    username: "admin",
                    password: "18394hjnlkaf981hnjklafuy1honlaufo",
                    clientCertificateConfig: {
                        issueClientCertificate: false
                    },
                },
                nodePools: [
                    {
                        name: "default",
                        config: {
                            labels: {
                                mode: "test",
                            },
                            oauthScopes: [
                                "https://www.googleapis.com/auth/devstorage.read_only"
                            ]
                        },
                        initialNodeCount: 1,

                    }
                ],
                locations: [
                    this.zone
                ],
            }
    
        }).then(async (out) => {
            await this.waitForOperation(out[0])
            const cluster: container.protos.google.container.v1.ICluster = (await this.client.getCluster({projectId: this.projectId, zone: this.zone, clusterId: this.clusterId}))[0]
            return cluster
        }).then(async (cluster) => {
            const kc = new k8s.KubeConfig()
        
            kc.addCluster({
                name: "test-cluster4",
                skipTLSVerify: false,
                server: `https://${cluster.masterAuth.username}:${cluster.masterAuth.username}@${cluster.endpoint}`,
                caData: cluster.masterAuth.clusterCaCertificate
            })
    
                // cluster.masterAuth.
            kc.addUser({
                name: "jeremy-drouillard-testing",
                username: cluster.masterAuth.username,
                password: cluster.masterAuth.password
            })
            kc.addContext({
                cluster: "test-cluster4",
                user: "jeremy-drouillard-testing",
                name: "test-context",
            })
            kc.setCurrentContext("test-context")
    
        
            const k8sApi= kc.makeApiClient(k8s.CoreV1Api)
            const out = await k8sApi.createNamespacedPod("default", {
                kind: "Pod",
                metadata: {
                    name: "hello-pod",
                    labels: {
                        app: "poc"
                    }
                },
                spec: {
                    nodeSelector: {
                        mode: "test"
                    },
                    containers: [{
                        name: "hello-world",
                        image: "us.gcr.io/conder-systems-281115/hello-world@sha256:b6d75537098361eea4311192f133bad63079d1d93018c07b4d5e5537d427c29e",
                        ports: [{containerPort: 8080}],
                        startupProbe: {
                            httpGet: {
                                port: {port: 8080},
                            }
                        }
                    }]
                },
            }).then(() => {
                
                k8sApi.createNamespacedService("default", {
                    kind: "Service",
                    metadata: {
                        name: "hello-pod-service"
                    },
                    spec: {
                        externalTrafficPolicy: "Cluster",
                        ports: [
                            {
                                nodePort: 32575, 
                                port: 80,
                                protocol: "TCP",
                                //@ts-ignore
                                targetPort: 8080
                            }
                        ],
                        selector: {
                            app: "poc"
                        },
                        sessionAffinity: "None",
                        type: "LoadBalancer"
                    }
                }).then(async (r) => {
                    while (!r.body.status.loadBalancer.ingress) {
                        await new Promise(resolve => setTimeout(resolve, 5000))
                        r = await k8sApi.readNamespacedService("hello-pod-service", "default")
                    }
                    console.log(`IP FOR SERVICE: ${r.body.status.loadBalancer.ingress[0].ip}`)
                }).catch(console.error)
            })
            return cluster
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
    const clusterId = "test-cluster4"
    const provisioner =  new GoogleCloudProvisioner(client, projectId, zone, clusterId)
    
    await provisioner.deploy()
    // .finally(() => provisioner.teardown())
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

