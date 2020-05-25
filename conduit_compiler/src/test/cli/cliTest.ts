import * as child_process from "child_process";
import * as fs from "fs";

test("invoking compiler without dir fails", () => {
  const r = child_process.execSync("node ../../../dist/index.js 2>&1", {
    cwd: "src/test/cli/",
    encoding: "utf-8",
  });
  expect(r).toMatchInlineSnapshot(`
    "Unable to find conduit files in conduit/
    "
  `);
});

describe("dir test", () => {
  

  it("points out empty dir", () => {
    const r = child_process.execSync("node ../../../dist/index.js 2>&1", {
      cwd: "src/test/cli/",
      encoding: "utf-8",
    });
    expect(r).toMatchInlineSnapshot(`
      "Unable to find conduit files in conduit/
      "
    `);
  });
});

describe.each([
  ["singleConduitType"]
])("test dir: %s",(dirname: string) => {

  const testDir = `src/test/cli/${dirname}`

  afterEach(() => {
    child_process.execSync("rm -rf .proto", { cwd: testDir });
  });

  it("\nprotos", () => {
    const out = child_process.execSync("node ../../../../dist/index.js", {
      cwd: testDir,
      encoding: "utf-8",
    });
    console.log(out);
  
    const protos = fs.readdirSync(`${testDir}/.proto`);
  
    protos.forEach((p) =>
      expect(
        fs.readFileSync(`${testDir}/.proto/${p}`, {
          encoding: "utf-8",
        })
      ).toMatchSnapshot(`\n\t${p}:`)
    );
  })
});
