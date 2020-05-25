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

describe("empty dir test", () => {
  beforeEach(() => {
    child_process.execSync("mkdir conduit", { cwd: "src/test/cli/" });
  });

  afterEach(() => {
    child_process.execSync("rm -rf conduit .proto", { cwd: "src/test/cli/" });
  });

  it("points out empty dir", () => {
    const r = child_process.execSync("node ../../../dist/index.js 2>&1", {
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

    message M1 {
      double d
      Animal a
    }
    `
    );

    const out = child_process.execSync("node ../../../dist/index.js", {
      cwd: "src/test/cli/",
      encoding: "utf-8",
    });
    console.log(out);

    const protos = fs.readdirSync("src/test/cli/.proto");

    expect(protos).toEqual(["test.proto"]);
    protos.forEach(p => expect(fs.readFileSync(`src/test/cli/.proto/${p}`, {encoding: "utf-8"})).toMatchSnapshot())
  });
});
