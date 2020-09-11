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
  const portAssignments: Map<number, child_process.ChildProcess> = new Map();
  child_process.execSync(`cargo build`, {
    cwd: "./src/rust",
    stdio: "inherit",
  });

  beforeEach(() => {
    const out: child_process.ChildProcess = child_process.exec("./app 8080", {
      cwd: "./src/rust/target/debug",
    });
    portAssignments.set(8080, out);
  });

  afterAll(() => {
    portAssignments.forEach((v) => v.kill("SIGKILL"));
  });

  it("should be able to do nothing", async () => {
    const res = await fetch("http://localhost:8080", {
      method: "PUT",
      body: "",
      headers: {
        "content-type": "application/json",
        "content-length": `0`,
      },
    }).then((data) => data.json());

    expect(res).toEqual({kind: "None"});
  });
});
