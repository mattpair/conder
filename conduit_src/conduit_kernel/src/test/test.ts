import * as child_process from "child_process";
import "isomorphic-fetch";
import { getOpWriter, Procedures, interpeterTypeFactory, InterpreterTypeInstance, Schemas, schemaFactory} from "../../index";
import { Lexicon } from "conduit_parser";

describe("conduit kernel", () => {
    const opWriter = getOpWriter()
    class TestServer {
        private process: child_process.ChildProcess

        constructor(procedures: Procedures, schemas: Schemas) {
             
            this.process = child_process.exec(`./app 8080`, {
                cwd: "./src/rust/target/debug",
                env: {
                    "PROCEDURES": JSON.stringify(procedures),
                    "SCHEMAS": JSON.stringify(schemas)
                },                
              });
            this.process.stdout.pipe(process.stdout)
            this.process.stderr.pipe(process.stderr)
        }
        
        public static async start(procedures: Procedures, schemas: Schemas): Promise<TestServer> {
            // portAssignments.set(8080, this.process);
            const ret = new TestServer(procedures, schemas)
            let retry = true 
            while (retry) {
                try {
                    await ret.noopRequest()
                    retry = false
                } catch (e) {
                    retry = true
                } 
            }
            return ret
        }

        async noopRequest() {
            const body = JSON.stringify({kind: "Noop"})
            const res = await fetch("http://localhost:8080/", {
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
            this.process.kill("SIGTERM")
        }

        async invoke(name: string, arg: InterpreterTypeInstance<any> = interpeterTypeFactory.None) {
            const body = JSON.stringify({kind: "Exec", data: {proc: name, arg}})
            return fetch("http://localhost:8080/", {
                method: "PUT",
                body,
                headers: {
                "content-type": "application/json",
                "content-length": `${body.length}`,
                },
            }).then((data) => data.json())
        }
    }

    function kernelTest(descr: string, test: (server: TestServer) => Promise<void>, procs: Procedures ={}, schemas: Schemas=[]) {
        it(descr, async () => {
            const server = await TestServer.start(procs, schemas)
            await test(server)
            server.kill()
        }, 10000)
    }
  
    describe("noop server", () => {
        kernelTest("should be able to do nothing", async () => {});
    })
    
    describe("procedures", () => {
        kernelTest("invoking a custom noop", async (server) => {
            const res = await server.invoke("customNoop")
            expect(res).toEqual(interpeterTypeFactory.None)
        }, {"customNoop": [opWriter.noop]})
    })

    describe("schema", () => {
        kernelTest("validate schema of input - primitive", async (server) => {
            // No input
            let failures = 0
            await server.invoke("validateSchema").catch(() => failures++)
            expect(failures).toBe(1)
            // Invalid input
            await server.invoke("validateSchema", interpeterTypeFactory.double(12)).catch(() => failures++)
            expect(failures).toBe(2)
            const res = await server.invoke("validateSchema", interpeterTypeFactory.bool(true))
            expect(res).toEqual(interpeterTypeFactory.bool(true))

        }, {"validateSchema": [opWriter.enforceSchemaOnHeap({schema: 0, heap_pos: 0}), opWriter.returnVariable(0)]}, [schemaFactory.primitive(Lexicon.Symbol.bool)])
    })
});
