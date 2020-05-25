import * as child_process from "child_process";
import * as fs from "fs";

test("invoking compiler without dir fails", () => {
  const r = child_process.execSync("node ../../../dist/index.js 2>&1", {
    cwd: "src/test/cli/",
    encoding: "utf-8",
  });
  expect(r).toMatchInlineSnapshot(`
    "Unable to find ./conduit/
    "
  `);
});

describe.each([["singleConduitType"], ["emptyConduitDir", true]])(
  "test dir: %s",
  (dirname: string, fails: boolean = false) => {
    const testDir = `src/test/cli/${dirname}`;

    afterEach(() => {
      child_process.execSync("rm -rf .proto", { cwd: testDir });
    });

    it("\nprotos", () => {
      const out = child_process.execSync(
        "node ../../../../dist/index.js 2>&1",
        {
          cwd: testDir,
          encoding: "utf-8",
        }
      );
      expect(out).toMatchSnapshot(`\n\toutput:`);

      if (fails) {
        return;
      }

      const protos = fs.readdirSync(`${testDir}/.proto`);

      protos.forEach((p) =>
        expect(
          fs.readFileSync(`${testDir}/.proto/${p}`, {
            encoding: "utf-8",
          })
        ).toMatchSnapshot(`\n\t${p}:`)
      );
    });
  }
);
