import { CompiledTypes, Utilities } from 'conduit_parser';
import * as container from '@google-cloud/container'
import * as k8s from '@kubernetes/client-node'
import * as fs from 'fs'
import axios from 'axios'
import { generateRandomPassword } from './security';
import { ConduitBuildConfig } from './config/load';


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
        const password: string = generateRandomPassword()
        
        return this.client.createCluster({
            projectId: this.projectId,
            zone: this.zone,
            cluster: {
                name: this.clusterId,
                description: "",
                masterAuth: {
                    username: "admin",
                    password,
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

export const deployOnToCluster: Utilities.StepDefinition<
    {mediumState: MediumState, manifest: CompiledTypes.Manifest, remoteContainers: {main: string, postgres: string}, buildConf: ConduitBuildConfig},
    {endpoint: string}> = {
        stepName: "deploy on to cluster",
        func: async ({mediumState, manifest, remoteContainers, buildConf}) => {
            const namespace = buildConf.project
            const kc = new k8s.KubeConfig()
            const serviceName = `public-${namespace}`
            const mainPodName = `${serviceName}-pod-main`
            const pgPodName = `${namespace}-pod-pg`
            
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
            await k8sApi.createNamespace({
                kind: "Namespace",
                metadata: {
                    name: namespace
                }
            })
            
            await k8sApi.createNamespacedSecret(namespace, {
                kind: "Secret",
                metadata: {
                    name: "postgres-data",
                    namespace
                },
                type: "Opaque",
                stringData: {
                    //Postgres appears to only support passwords less than 100 chars.
                    // https://www.postgresql-archive.org/Maximum-password-length-td6054172.html
                    password: generateRandomPassword(70)
                }
            })
            await k8sApi.createNamespacedPod(namespace, {
                kind: "Pod",
                metadata: {
                    name: pgPodName,
                    labels: {
                        app: serviceName + "-pg"
                    }
                },
                spec: {
                    nodeSelector: {
                        mode: "test"
                    },
                    containers: [{
                        name: pgPodName,
                        image: remoteContainers.postgres,
                        ports: [{containerPort: 5432}],
                        env: [{
                            name: "POSTGRES_PASSWORD",
                            valueFrom: {
                                secretKeyRef: {
                                    name: "postgres-data",
                                    key: "password"
                                }
                            }
                        }]
                }]
            }}).then(() => {
                return k8sApi.createNamespacedService(namespace, {
                    kind: "Service",
                    metadata: {name: "postgres"},
                    spec: {
                        type: "ClusterIP",
                        selector: {app: serviceName + "-pg"},
                        ports: [{protocol: "TCP", port: 5432, 
                        //@ts-ignore
                        targetPort: 5432}]
                    }
                })
            })

            await k8sApi.createNamespacedPod(namespace, {
                kind: "Pod",
                metadata: {
                    name: mainPodName,
                    labels: {
                        app: serviceName
                    }
                },
                spec: {
                    nodeSelector: {
                        mode: "test"
                    },
                    containers: [{
                        name: mainPodName,
                        image: remoteContainers.main,
                        ports: [{containerPort: 8080}],
                        startupProbe: {
                            httpGet: {
                                port: {port: 8080},
                            }
                        },
                        env: [{
                            name: "POSTGRES_PASSWORD",
                            valueFrom: {
                                secretKeyRef: {
                                    name: "postgres-data",
                                    key: "password"
                                }
                            }
                        }]
                    }]
                },
            })
                    
            return k8sApi.createNamespacedService(namespace, {
                kind: "Service",
                metadata: {
                    name: `${serviceName}-service`
                },
                spec: {
                    externalTrafficPolicy: "Cluster",
                    ports: [{
                        nodePort: 32575, 
                        port: 80,
                        protocol: "TCP",
                        //@ts-ignore
                        targetPort: 8080
                    }],
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