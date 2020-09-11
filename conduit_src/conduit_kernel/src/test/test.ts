import * as child_process from "child_process";
import "isomorphic-fetch";

describe("conduit kernel", () => {

    class TestServer {
        private process: child_process.ChildProcess = child_process.exec("./app 8080", {
            cwd: "./src/rust/target/debug",
          });
        
        public static async start(): Promise<TestServer> {
            // portAssignments.set(8080, this.process);
            const ret = new TestServer()
            let retry = true 
            while (retry) {
                try {
                    const res = await fetch("http://localhost:8080/", {
                        method: "PUT",
                        body: "",
                        headers: {
                        "content-type": "application/json",
                        "content-length": `0`,
                        },
                    }).then((data) => data.json());
                
                    expect(res).toEqual({kind: "None"});
                    retry = false
                } catch (e) {
                    retry = true
                } 
            }
            return ret
        }

        dumpOutput() {
            // console.log(this.process.stdout)
            console.error(this.process.stdout.read())
        }
        kill() {
            this.process.kill("SIGKILL")
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
