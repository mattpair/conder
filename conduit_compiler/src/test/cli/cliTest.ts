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

enum TestAttribute {
  DOES_NOT_COMPILE_SUCCESSFULLY="Does not compile successfully"
}

const attributes: Map<string, TestAttribute[]> = new Map([
  ["emptyConduitDir", [TestAttribute.DOES_NOT_COMPILE_SUCCESSFULLY]]
])


describe.each([["singleConduitType"], ["emptyConduitDir"]])(
  "test dir: %s",
  (dirname: string) => {

    const testAttributes = attributes.get(dirname) ? attributes.get(dirname) : []
    const testDir = `src/test/cli/${dirname}`;
    console.log(`Running with attributes: ${JSON.stringify(testAttributes)}`)

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

      if (testAttributes.includes(TestAttribute.DOES_NOT_COMPILE_SUCCESSFULLY)) {
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
