import * as child_process from "child_process";

test("invoking compiler without dir fails", () => {
  const r = child_process.execSync("node ../../../index.js 2>&1", {
    cwd: "src/test/cli/",
    encoding: "utf-8",
  });
  expect(r).toMatchInlineSnapshot(`
    "Unable to find conduit files in conduit/ Error: ENOENT: no such file or directory, scandir './conduit/'
        at Object.readdirSync (fs.js:872:3)
        at Object.<anonymous> (/Users/jerm/MyCode/conduit/conduit_compiler/index.js:6:18)
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

test("invoking compiler with empty conduit dir points out empty dir", () => {
  child_process.execSync("mkdir conduit", { cwd: "src/test/cli/" });
  const r = child_process.execSync("node ../../../index.js 2>&1", {
    cwd: "src/test/cli/",
    encoding: "utf-8",
  });
  expect(r).toMatchInlineSnapshot(`
    "no files to compile
    "
  `);
  child_process.execSync("rm -rf conduit", { cwd: "src/test/cli/" });
});
