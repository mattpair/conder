import * as child_process from "child_process";
import "isomorphic-fetch";

// function testBody(conduit: string) {
//     const manifest = compileFiles({test: () => conduit}, {dependents: {}, project: "test", install: []})
//     return new Utilities.Sequence(deriveSupportedOperations)
//     .then(functionToByteCode)
//     .then(writeRustAndContainerCode)
//     .run({manifest, foreignLookup: new Map(), foreignContainerInstr: []})
// }

describe("conduit kernel", () => {

    class TestServer {
        private process: child_process.ChildProcess = child_process.exec("./app 8080", {
            cwd: "./src/rust/target/debug",
          });
        
        constructor(){
            // portAssignments.set(8080, this.process);
        }

        dumpOutput() {
            // console.log(this.process.stdout)
            console.error(this.process.stdout.read())
        }
        kill() {
            this.process.kill("SIGKILL")
        }
    }
  
    describe("noop server", () => {
        it("should be able to do nothing", async () => {
            const server = new TestServer()
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
            server.kill()
            
        }, 10000);
    })
    

});
