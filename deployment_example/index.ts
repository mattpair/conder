import { ServerEnv, Var } from 'conduit_compiler';
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as fs from 'fs'
import * as mongodb from '@pulumi/mongodbatlas'
import * as random from '@pulumi/random'


// Set your own location and project.
const location = "us-west1"
const project ="conder-systems-281115"

const envs: gcp.types.input.cloudrun.ServiceTemplateSpecContainerEnv[] = []

// Read the compiled artifacts
const config = JSON.parse(fs.readFileSync("app.json", {encoding: "utf-8"}))
Object.keys(Var).forEach(v => {
    const value = config[v]
    if (value !== "") {
        envs.push({name: v, value })
    }
})

// Put your arg id here.
const mongoproject = new mongodb.Project("auto", {orgId: "5f7f9db6d8914966326bc134"})
const cluster = new mongodb.Cluster("test", 
    {
        projectId: mongoproject.id, 
        providerInstanceSizeName: "M10", 
        providerName: "GCP",
        providerRegionName: "CENTRAL_US",
    }
)
const whitelist = new mongodb.ProjectIpWhitelist("anyone", {projectId: mongoproject.id, cidrBlock: "0.0.0.0/0"})
const mongopwd = new random.RandomPassword("mongo-user-password", {length: 30, lower: true, upper: true, number: true, special: false})
const mongouser = new mongodb.DatabaseUser("mongouser", {
    projectId: mongoproject.id,
    username: "conduitUser",
    authDatabaseName: "admin",
    password: mongopwd.result,
    roles: [{databaseName: "admin", roleName: "readWriteAnyDatabase"}]
})

const mongodburi = cluster.srvAddress.apply(t => {
    const prefix = t.substring(0, t.search("://"))
    const urireplacer = pulumi.interpolate`${prefix}://${mongouser.username}:${mongopwd.result}@`
    return pulumi.interpolate`${urireplacer.apply(r => t.replace(`${prefix}://`, r))}/admin`
})

envs.push(
    {name: Var.MONGO_CONNECTION_URI, value: mongodburi}, 
    {name: Var.DEPLOYMENT_NAME, value: "example"}
)

const deployment = new gcp.cloudrun.Service("mycloudrun", {
    location,
    project,
    template: {
        spec: {
            containers: [
                {
                    image: "us.gcr.io/conder-systems-281115/kernel-server:latest", 
                    ports: [{containerPort: 8080}],
                    // Should probably use k8s directly so you can encode env variables
                    // as secrets.
                    envs
                }
            ]
        }
    }
})

const iamHello = new gcp.cloudrun.IamMember("any access", {
    service: deployment.name,
    location,
    project,
    role: "roles/run.invoker",
    member: "allUsers",
});

export const url = deployment.status.url