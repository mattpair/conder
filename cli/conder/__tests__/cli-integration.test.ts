import { system, filesystem } from "gluegun";

const src = filesystem.path(__dirname, "..");

const cli = async cmd =>
  system.run("node " + filesystem.path(src, "bin", "conder") + ` ${cmd}`);

test("output with nothing", async () => {
  expect(await cli("")).toMatchInlineSnapshot(`
    "[0mWelcome to Conder[0m
    "
  `);
});

