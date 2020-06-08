import * as child_process from "child_process";
import * as fs from "fs";

test("invoking compiler without dir fails", () => {
  const r = child_process.execSync("./conduit 2>&1", {
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


const testDirs = fs.readdirSync("src/test/cli/", {withFileTypes: true})
  .filter(d => d.isDirectory() && !/^(\.|__)/.test(d.name))


const ONLY: string[] = []

describe.each(testDirs.map(dir => dir.name))(
  "test dir: %s",
  (dirname: string) => {
    if (ONLY.length > 0 && !(ONLY.includes(dirname))) {
      return 
    }

    const testAttributes = attributes.get(dirname) ? attributes.get(dirname) : []
    const testDir = `src/test/cli/${dirname}`;
    console.log(`Running with attributes: ${JSON.stringify(testAttributes)}`)

    afterEach(() => {
      child_process.execSync("rm -rf .proto python/models", { cwd: testDir });
    });

    it("\nprotos", () => {
      const out = child_process.execSync(
        "../conduit 2>&1",
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

      const models = fs.readdirSync(`${testDir}/python/models`)
      models.forEach(m => {
        expect(
          fs.readFileSync(`${testDir}/python/models/${m}`, {encoding: "utf-8"})
        ).toMatchSnapshot(`\n\t${m}`)
      }
    );
  })  
});
