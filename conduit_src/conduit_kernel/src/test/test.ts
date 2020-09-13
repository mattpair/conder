import * as child_process from "child_process";
import "isomorphic-fetch";
import { getOpWriter, Procedures, interpeterTypeFactory} from "../../index";

describe("conduit kernel", () => {
    const opWriter = getOpWriter()
    class TestServer {
        private process: child_process.ChildProcess

        private readonly procedures: Procedures
        constructor(procedures: Procedures) {
            this.procedures = procedures
            this.process = child_process.exec(`./app 8080`, {
                cwd: "./src/rust/target/debug",
                env: {
                    "PROCEDURES": JSON.stringify(this.procedures)
                }
              });
        }
        
        public static async start(procedures: Procedures): Promise<TestServer> {
            // portAssignments.set(8080, this.process);
            const ret = new TestServer(procedures)
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

        async invoke(name: string) {
            const body = JSON.stringify({kind: "Exec", data: {proc: name, arg: interpeterTypeFactory.None}})
            return await fetch("http://localhost:8080/", {
                method: "PUT",
                body,
                headers: {
                "content-type": "application/json",
                "content-length": `${body.length}`,
                },
            }).then((data) => data.json());
        }
    }

    function kernelTest(descr: string, test: (server: TestServer) => Promise<void>, procs: Procedures ={}) {
        it(descr, async () => {
            const server = await TestServer.start(procs)
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
});
