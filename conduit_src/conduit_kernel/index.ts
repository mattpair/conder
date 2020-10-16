import * as fs from 'fs'
import * as child_process from 'child_process'
import { generateServer, StrongServerEnv, ServerEnv, Var } from './src/main/server_writer'
import { CompleteOpWriter, OpSpec, OpInstance,  } from './src/main/interpreter/supported_op_definition'
import { interpeterTypeFactory,  AnyInterpreterTypeInstance} from './src/main/interpreter/interpreter_writer'
import * as mongodb from "mongodb";

function writeMain() {
    fs.mkdirSync("./src/rust/src/", {recursive: true})
    fs.writeFileSync("./src/rust/src/main.rs", generateServer())
}
module.exports.writeMain = writeMain

module.exports.containerize = function () {
    writeMain()
    console.log("PWD", process.cwd())
    child_process.execSync(`docker build -t us.gcr.io/conder-systems-281115/kernel-server:latest . && docker push us.gcr.io/conder-systems-281115/kernel-server:latest`, {cwd: "./src/rust", stdio: "inherit"})
}

export function getOpWriter(): CompleteOpWriter {
    const ret: Partial<CompleteOpWriter> = {}
    for (const kind in OpSpec) {
        //@ts-ignore
        const inst: any = OpSpec[kind] 
        
        if (inst.factoryMethod) {
            //@ts-ignore
            ret[kind] = inst.factoryMethod
        } else {
            //@ts-ignore
            ret[kind] = {kind, data: undefined}
        }
        
    }
    return ret as CompleteOpWriter
}

export {AnyOpInstance, CompleteOpWriter} from './src/main/interpreter/supported_op_definition'
export type Procedures = Record<string, OpInstance[]>


export { interpeterTypeFactory, InterpreterTypeInstanceMap, AnyInterpreterTypeInstance  } from './src/main/interpreter/interpreter_writer'
export {ServerEnv, EnvVarType, Var, StrongServerEnv, RequiredEnv} from './src/main/server_writer'

export namespace Test {
    export class Server {
        private process: child_process.ChildProcess;
        private readonly port: number;
        private static next_port = 8080;
        constructor(env: StrongServerEnv) {
          this.port = Server.next_port++;
          const string_env: Partial<ServerEnv> = {};
          for (const key in env) {
            //@ts-ignore
            string_env[key] =
            //@ts-ignore
              typeof env[key] === "string" ? env[key] : JSON.stringify(env[key]);
          }
      
          this.process = child_process.exec(`./app ${this.port}`, {
            cwd: "./src/rust/target/debug",
            env: string_env,
          });
          this.process.stdout.pipe(process.stdout);
          this.process.stderr.pipe(process.stderr);
        }
      
        public static async start(env: StrongServerEnv): Promise<Server> {
          // portAssignments.set(8080, this.process);
          const ret = new Server(env);
          let retry = true;
          while (retry) {
            try {
              await ret.noopRequest();
              retry = false;
            } catch (e) {
              retry = true;
            }
          }
          return ret;
        }
      
        async noopRequest() {
          const body = JSON.stringify({ kind: "Noop" });
          const res = await fetch(`http://localhost:${this.port}`, {
            method: "PUT",
            body,
            headers: {
              "content-type": "application/json",
              "content-length": `${body.length}`,
            },
          }).then((data) => data.json());
      
          expect(res).toEqual(interpeterTypeFactory.None);
        }
      
        kill() {
          this.process.kill("SIGTERM");
        }
      
        async invoke(
          name: string,
          arg: AnyInterpreterTypeInstance = interpeterTypeFactory.None
        ) {
          const body = JSON.stringify({ kind: "Exec", data: { proc: name, arg } });
          return fetch(`http://localhost:${this.port}/`, {
            method: "PUT",
            body,
            headers: {
              "content-type": "application/json",
              "content-length": `${body.length}`,
            },
          }).then((data) => data.json());
        }
      }
      
      export type Stores = Pick<StrongServerEnv, Var.STORES>;
      
      export class Mongo {
        readonly port: number;
        private static next_port = 27017;
        private constructor() {
          this.port = Test.Mongo.next_port++;
          child_process.execSync(
            `docker run --rm --name mongo${this.port} -d  --mount type=tmpfs,destination=/data/db -p ${this.port}:27017 mongo:4.4 `
          );
        }
      
        public static async start(stores: Stores): Promise<Test.Mongo> {
          const ret = new Test.Mongo();
          const client = await mongodb.MongoClient.connect(
            `mongodb://localhost:${ret.port}`,
            { useUnifiedTopology: true }
          );
          const db = client.db("statefultest");
          Object.keys(stores.STORES).forEach(
            async (k) => await db.createCollection(k)
          );
          await db.listCollections();
          return ret;
        }
        public kill() {
          child_process.execSync(`docker kill mongo${this.port}`);
        }
      }
      
      
}