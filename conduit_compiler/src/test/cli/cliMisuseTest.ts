import * as child_process from "child_process";

test("invoking compiler without dir fails", (done) => {
  child_process.exec(
    "node ../../../index.js",
    { cwd: "src/test/cli/" },
    (except: child_process.ExecException, stdout: string, stder: string) => {
      expect(except).toBeNull();
      expect(stdout).toMatchInlineSnapshot(`""`);
      expect(stder).toMatchInlineSnapshot(`
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
      done();
    }
  );
});
