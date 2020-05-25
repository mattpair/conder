import * as child_process from "child_process";
import * as fs from "fs";

test("invoking compiler without dir fails", () => {
  const r = child_process.execSync("node ../../../index.js 2>&1", {
    cwd: "src/test/cli/",
    encoding: "utf-8",
  });
  expect(r).toMatchInlineSnapshot(`
    "Unable to find conduit files in conduit/ Error: ENOENT: no such file or directory, scandir './conduit/'
        at Object.readdirSync (fs.js:872:3)
        at Object.<anonymous> (/Users/jerm/MyCode/conduit/conduit_compiler/index.js:6:23)
        at Module._compile (internal/modules/cjs/loader.js:1133:30)
        at Object.Module._extensions..js (internal/modules/cjs/loader.js:1153:10)
        at Module.load (internal/modules/cjs/loader.js:977:32)
        at Function.Module._load (internal/modules/cjs/loader.js:877:14)
        at Function.executeUserEntryPoint [as runMain] (internal/modules/run_main.js:74:12)
        at internal/main/run_main_module.js:18:47 {
      errno: -2,
      syscall: 'scandir',
      code: 'ENOENT',
      path: './conduit/'
    }
    "
  `);
});

describe("empty dir test", () => {
  beforeEach(() => {
    child_process.execSync("mkdir conduit", { cwd: "src/test/cli/" });
  });

  afterEach(() => {
    child_process.execSync("rm -rf conduit .proto", { cwd: "src/test/cli/" });
  });

  it("points out empty dir", () => {
    const r = child_process.execSync("node ../../../index.js 2>&1", {
      cwd: "src/test/cli/",
      encoding: "utf-8",
    });
    expect(r).toMatchInlineSnapshot(`
      "no files to compile
      "
    `);
  });

  it("can translate one file to proto", () => {
    fs.writeFileSync(
      "src/test/cli/conduit/test.cdt",
      `
    enum Animal {
      Cat
      Dog
    }

    messsage M1 {
      double d
      Animal a
    }
    `
    );

    const out = child_process.execSync("node ../../../index.js", {
      cwd: "src/test/cli/",
      encoding: "utf-8",
    });
    console.log(out)

    const protos = fs.readdirSync("src/test/cli/.proto");

    expect(protos.length).toEqual("test.proto")
  });
});
