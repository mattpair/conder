import * as fs from 'fs'
import * as child_process from 'child_process'
import { StrongServerEnv, ServerEnv, Var } from '../server_writer'
import { interpeterTypeFactory,  AnyInterpreterTypeInstance} from '../interpreter/interpreter_writer'
import * as mongodb from "mongodb";
import "isomorphic-fetch";

export namespace Test {
    export class Server {
        private process: child_process.ChildProcess;
        private readonly port: number;
        private static next_port = 8080;
        constructor(env: StrongServerEnv, path_prefix: string) {
          this.port = Server.next_port++;
          const string_env: Partial<ServerEnv> = {};
          for (const key in env) {
            //@ts-ignore
            string_env[key] =
            //@ts-ignore
              typeof env[key] === "string" ? env[key] : JSON.stringify(env[key]);
          }
          this.process = child_process.exec(`./app ${this.port}`, {
            cwd: `${path_prefix}src/rust/target/debug`,
            env: string_env,
          });
          this.process.stdout.pipe(process.stdout);
          this.process.stderr.pipe(process.stderr);
        }
      
        public static async start(env: StrongServerEnv, path_prefix="./"): Promise<Server> {
          // portAssignments.set(8080, this.process);
          const ret = new Server(env, path_prefix);
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
          ...arg: AnyInterpreterTypeInstance[]
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
            { useUnifiedTopology: true}
          );
          const storeKeys= Object.keys(stores.STORES)
          const db = client.db("statefultest");

          const creates = storeKeys.map((k) => db.createCollection(k));
          
          await Promise.all(creates).then(() => db.listCollections()).catch((err)=> console.error(err))
          
          return ret;
        }
        public kill() {
          child_process.execSync(`docker kill mongo${this.port}`);
        }
      }
      
      
}