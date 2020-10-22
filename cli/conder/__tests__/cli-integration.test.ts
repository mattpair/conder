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

test("help output", async () => {
  expect(await cli("--help")).toMatchInlineSnapshot(`
    "[0mconder version 0.0.1[0m

    [90m [39m conder      [90m [39m -                         
    [90m [39m version (v) [90m [39m Output the version number 
    [90m [39m compile (c) [90m [39m -                         
    [90m [39m help (h)    [90m [39m -                         
    "
  `);
});
