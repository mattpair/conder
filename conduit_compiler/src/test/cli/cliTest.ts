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
  afterEach(() => {
    
  });

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

  it("can translate one file to proto", () => {
    const out = child_process.execSync("node ../../../../dist/index.js", {
      cwd: "src/test/cli/singleConduitType",
      encoding: "utf-8",
    });
    console.log(out);

    const protos = fs.readdirSync("src/test/cli/singleConduitType/.proto");

    expect(protos).toEqual(["test.proto"]);
    protos.forEach((p) =>
      expect(
        fs.readFileSync(`src/test/cli/singleConduitType/.proto/${p}`, {
          encoding: "utf-8",
        })
      ).toMatchSnapshot()
    );

    child_process.execSync("rm -rf .proto", { cwd: "src/test/cli/singleConduitType" });
  });
});
