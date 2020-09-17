import { StrongServerEnv, RequiredEnv, ServerEnv } from 'conduit_kernel';
import { loadBuildConfig } from './config/load';
import * as fs from 'fs';
import * as child_process from 'child_process'
import * as mongodb from 'mongodb'
import {compileFiles, CompiledTypes, Utilities, ConduitBuildConfig} from 'conduit_parser'
import {compile, generateClients} from 'conduit_compiler'

function conduitsToTypeResolved(conduits: string[], buildConf: ConduitBuildConfig): CompiledTypes.Manifest {
    const toCompile: Record<string, () => string> = {}
    conduits.forEach(c => toCompile[c] = () => fs.readFileSync(`./conduit/${c}`, {encoding: "utf-8"}))
    return compileFiles(toCompile, buildConf)
}
function getConduitFileNames(): string[] {   
    function readdirRecursive(currentpath: string): string[] {
        const conduits: string[] = []
        const dirents = fs.readdirSync(currentpath, {withFileTypes: true})

        dirents.forEach(ent => {
            if (ent.isDirectory()) {
                conduits.push(...readdirRecursive(`${currentpath}/${ent.name}`).map(name => `${ent.name}/${name}`))

            } else if (ent.isFile()) {
                conduits.push(ent.name)
            }               
        })
        return conduits
    }
    const conduits = readdirRecursive("./conduit/")

    if (conduits.length == 0) {
        console.warn(`no files to compile`)
        return
    }
    return conduits
}

async function writeClientFile(clients: string, buildConf: ConduitBuildConfig) {
    
    const p = []
    for (const dir in buildConf.dependents) {
        p.push(fs.promises.writeFile(`${dir}/clients.ts`, clients))

    }
    return await Promise.all(p)
}

async function deployLocally(env: Pick<StrongServerEnv, RequiredEnv>) {
    // child_process.execSync(`docker pull mongo:4.4`, {stdio: "pipe"});
    console.log("starting mongo")
    child_process.execSync(`docker run --rm -d --mount type=tmpfs,destination=/data/db -p 27017:27017 --name mongodb mongo:4.4`);
    const killList = ["mongodb"]
    function kill() {
        killList.forEach(m => {
            console.log(`Exiting ${m}...`)
            child_process.execSync(`docker kill ${m}`)
        })
        
        process.exit(1)
    }
    process.on("SIGINT", kill)
    process.on("SIGTERM", kill)

    const ipaddress = child_process.execSync(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' mongodb`, {encoding: "utf-8"})
    
    const client = await mongodb.MongoClient.connect(
        "mongodb://localhost:27017",
        { useUnifiedTopology: true }
    ).catch((e) => {console.error(e); process.exit(1)});
    const db = client.db("conduit");
    Object.keys(env.STORES).forEach(storeName => db.createCollection(storeName))
    await db.listCollections().toArray()
    const string_env: Partial<ServerEnv> = {
        MONGO_CONNECTION_URI: `mongodb://${ipaddress}`
    };
    for (const key in env) {
        //@ts-ignore
        string_env[key] = typeof env[key] === "string" ? env[key] : JSON.stringify(env[key]);
    }
    console.log("starting server")
    // blocks until force quit.
    //@ts-ignore
    
    child_process.execSync(`docker run --rm -d -t -p 7213:8080 ${Object.keys(string_env).map(k => `-e ${k}=$${k}`).join(' ')} --name conduit-run kernel-server`, {
    env: string_env,
    });
    killList.push("conduit-run")
    console.log("server available at: http://localhost:7213")
}

const commands: Record<string, () => void> = {
    async init() {
        child_process.execSync(`docker pull mongo:4.4`);

    },

    async run() {
        const conf = loadBuildConfig()
        const filenames = getConduitFileNames()
        const manifest = conduitsToTypeResolved(filenames, conf)
        const env: Pick<StrongServerEnv, RequiredEnv> = compile(manifest)
        writeClientFile(generateClients("http://localhost:7213", manifest), conf)
        await deployLocally(env)
    },

}

export function execute() {
    const args = process.argv
    const command = args[2]
    if (!(command in commands)) {
        console.error(`${command} is invalid.\n\nOptions are ${JSON.stringify(Object.values(commands))}`)
    }

    commands[command]()
}