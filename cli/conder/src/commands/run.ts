
import { GluegunToolbox, GluegunCommand } from 'gluegun'
import {string_to_environment, ServerEnv} from 'conduit_compiler'  
import * as child_process from 'child_process'
import * as mongodb from 'mongodb'

const command: GluegunCommand = {
  name: 'run',
  run: async (toolbox: GluegunToolbox) => {
    const {
      print: { info, error },
      filesystem,
    } = toolbox
    
    
    const conduit = filesystem.read("main.cdt")
    if (conduit === undefined) {
      error(`Could not find required file main.cdt`)
      process.exit(1)
    }
    const output = string_to_environment(conduit)
    switch (output.kind) {
      case "success":
        console.log("starting mongo")
        const mongoname = `mongodb-conduit`
        const killActions: ({name: string, action: () => void})[] = []
        
        const startMongo = `docker run -d -p 27017:27017 --rm  --mount type=tmpfs,destination=/data/db --name ${mongoname} mongo:4.4`
        child_process.execSync(startMongo);
        killActions.push({name: "killing mongo", action: () => child_process.execSync(`docker kill ${mongoname}`)})
        
        const kill = () => {
            killActions.forEach(m => {
                try {
                    console.log(`${m.name}...`)
                    m.action()
                } catch(e) {
                    console.error(e)
                }
            })   
            process.exit(1)
        }

        process.on("SIGINT", kill)
        process.on("SIGTERM", kill)
    
        const ipaddress = child_process.execSync(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${mongoname}`, {encoding: "utf-8"})
        
        const client = await mongodb.MongoClient.connect(
            "mongodb://localhost:27017",
            { useUnifiedTopology: true }
        ).catch((e) => {console.error(e); process.exit(1)});
        
        const db = client.db("conduit");
        
    
        Object.keys(output.env.STORES).forEach(storeName => db.createCollection(storeName))
        
    
        await db.listCollections().toArray()
        const string_env: Partial<ServerEnv> = {
            MONGO_CONNECTION_URI: `mongodb://${ipaddress}`,
            DEPLOYMENT_NAME: "local-run"
        };
        for (const key in output.env) {
            //@ts-ignore
            string_env[key] = typeof output.env[key] === "string" ? output.env[key] : JSON.stringify(output.env[key]);
        }
        info("starting server")
        
        child_process.execSync(
            `docker run --rm -d -t -p 7213:8080 ${Object.keys(string_env).map(k => `-e ${k}=$${k}`).join(' ')} --name conduit-run us.gcr.io/conder-systems-281115/kernel-server:latest`, 
            {
                env: {
                    ...string_env, 
                    ...process.env
                },

            }
        );
        killActions.push({name: "tearing down conduit server", action: () => child_process.execSync("docker kill conduit-run")})
        info("server available at: http://localhost:7213")
        
        break
      case "error":
        error(output.reason)
        process.exit(1)
    }
  }
}

module.exports = command
