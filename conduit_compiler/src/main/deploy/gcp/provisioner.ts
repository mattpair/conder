import { StepDefinition } from './../../util/sequence';
import * as container from '@google-cloud/container'
import * as k8s from '@kubernetes/client-node'
import * as fs from 'fs'
import axios from 'axios'
import { FunctionResolved } from '../../entity/resolved'
import * as crypto from 'crypto'
import { ConduitBuildConfig } from 'config/load';


const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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
        console.log(`...waiting for operation ${op.name} ${op.operationType}:\t${op.statusMessage || op.status}...`)
        while (["RUNNING", "PENDING"].includes(op.status as string)) {
            await new Promise(resolve => setTimeout(resolve, 5000))
            op = (await this.client.getOperation({
                projectId: this.projectId, zone: this.zone, operationId: op.name
            }))[0]
        }
    }


    async createCluster(): Promise<container.protos.google.container.v1.ICluster> {
        console.log("Deploying cluster")
        const password: string[] = []
        
        crypto.randomBytes(512).forEach((b) => password.push(charset[b % charset.length]))

        return this.client.createCluster({
            projectId: this.projectId,
            zone: this.zone,
            cluster: {
                name: this.clusterId,
                description: "",
                masterAuth: {
                    username: "admin",
                    password: password.join(""),
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

export async function destroyNamespace(medium: MediumState, namespace: string): Promise<void> {
    const kc = new k8s.KubeConfig()
    
    kc.addCluster({
        name: medium.clusterId,
        skipTLSVerify: false,
        server: `https://${medium.username}:${medium.password}@${medium.endpoint}`,
        caData: medium.caCertificate
    })

    kc.addUser({
        name: `${medium.clusterId}-admin`,
        username: medium.username,
        password: medium.password
    })
    kc.addContext({
        cluster: medium.clusterId,
        user: `${medium.clusterId}-admin`,
        name: `${medium.clusterId}`,
    })
    kc.setCurrentContext(medium.clusterId)


    const k8sApi= kc.makeApiClient(k8s.CoreV1Api)
    await k8sApi.deleteNamespace(namespace)
}

export const deployOnToCluster: StepDefinition<
    {mediumState: MediumState, manifest: FunctionResolved.Manifest, remoteContainer: string, buildConf: ConduitBuildConfig},
    {endpoint: string}> = {
        stepName: "deploy on to cluster",
        func: ({mediumState, manifest, remoteContainer, buildConf}) => {
            const namespace = buildConf.project
            const kc = new k8s.KubeConfig()
            const serviceName = `${manifest.service.kind}-${namespace}`
            kc.addCluster({
                name: mediumState.clusterId,
                skipTLSVerify: false,
                server: `https://${mediumState.username}:${mediumState.password}@${mediumState.endpoint}`,
                caData: mediumState.caCertificate
            })
        
            kc.addUser({
                name: `${mediumState.clusterId}-admin`,
                username: mediumState.username,
                password: mediumState.password
            })
            kc.addContext({
                cluster: mediumState.clusterId,
                user: `${mediumState.clusterId}-admin`,
                name: `${mediumState.clusterId}`,
            })
            kc.setCurrentContext(mediumState.clusterId)
        
        
            const k8sApi= kc.makeApiClient(k8s.CoreV1Api)
            return k8sApi.createNamespace({
                kind: "Namespace",
                metadata: {
                    name: namespace
                }
            }).then(() => {
                return k8sApi.createNamespacedPod(namespace, {
                    kind: "Pod",
                    metadata: {
                        name: `${serviceName}-pod`,
                        labels: {
                            app: serviceName
                        }
                    },
                    spec: {
                        nodeSelector: {
                            mode: "test"
                        },
                        containers: [{
                            name: `${serviceName}-pod`,
                            image: remoteContainer,
                            ports: [{containerPort: 8080}],
                            startupProbe: {
                                httpGet: {
                                    port: {port: 8080},
                                }
                            }
                        }]
                    },
                }).then(() => {
                    
                    return k8sApi.createNamespacedService(namespace, {
                        kind: "Service",
                        metadata: {
                            name: `${serviceName}-service`
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
                                app: serviceName
                            },
                            sessionAffinity: "None",
                            type: "LoadBalancer"
                        }
                    }).then(async (r) => {
                        while (!r.body.status.loadBalancer.ingress) {
                            await new Promise(resolve => setTimeout(resolve, 5000))
                            r = await k8sApi.readNamespacedService(`${serviceName}-service`, namespace)
                        }
                        const url = `http://${r.body.status.loadBalancer.ingress[0].ip}`
                        let response = undefined
                        console.log("waiting for service to be reachable")
            
                        do {
                            response = await axios.get(url).catch((err) => {
                                console.error("failure reaching new service...trying again")
                                return {status: -1}
                            })
                            await new Promise(resolve => setTimeout(resolve, 5000))
                        } while (response.status !== 200)
                        
                        console.log(`IP FOR SERVICE: ${url}`)
                        return {endpoint: url}
                    })
                })
            })
        }
}

export type MediumState = Readonly<{
    kind: "gcp"
    projectId: string
    zone: string
    clusterId: string
    username: string
    password: string
    endpoint: string
    caCertificate: string
}>

export async function createMedium(name: string): Promise<MediumState> {
    const client = new container.v1.ClusterManagerClient()
    const projectId = await client.getProjectId()
    const zone =  "us-west1-a"
    const clusterId = name
    const provisioner =  new GoogleCloudProvisioner(client, projectId, zone, clusterId)
    
    return provisioner.createCluster().then((cluster) => {
        return {
            kind: "gcp",
            projectId,
            zone,
            clusterId,
            username: cluster.masterAuth.username,
            password: cluster.masterAuth.password,
            caCertificate: cluster.masterAuth.clusterCaCertificate,
            endpoint: cluster.endpoint
        }
    })
    
}


export async function destroy(medium: MediumState) {
    const client = new container.v1.ClusterManagerClient()
    const projectId = medium.projectId
    const zone =  medium.zone
    const clusterId = medium.clusterId
    const provisioner =  new GoogleCloudProvisioner(client, projectId, zone, clusterId)

    await provisioner.teardown()
}