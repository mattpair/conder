import * as child_process from "child_process";
import "isomorphic-fetch";
import { getOpWriter } from "../../index";
import { OpInstance } from "src/main/interpreter/supported_op_definition";

describe("conduit kernel", () => {
    const opWriter = getOpWriter()
    class TestServer {
        private process: child_process.ChildProcess

        private readonly procedures: Record<string, OpInstance[]>
        constructor(procedures: Record<string, OpInstance[]>) {
            this.procedures = procedures
            child_process.execSync(`PROCEDURES="${JSON.stringify(this.procedures)}"`)
            this.process = child_process.exec(`./app 8080`, {
                cwd: "./src/rust/target/debug",
              });
        }
        
        public static async start(procedures: Record<string, OpInstance[]>= {}): Promise<TestServer> {
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
        
            expect(res).toEqual({kind: "None"});
        }

        kill() {
            this.process.kill("SIGTERM")
        }
    }

    function kernelTest(descr: string, test: (server: TestServer) => Promise<void>) {
        it(descr, async () => {
            const server = await TestServer.start()
            await test(server)
            server.kill()
        }, 10000)
    }
  
    describe("noop server", () => {
        kernelTest("should be able to do nothing", async () => {});
    })
    

});
