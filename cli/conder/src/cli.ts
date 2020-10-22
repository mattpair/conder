import { build } from 'gluegun'

/**
 * Create the cli and kick it off
 */
async function run(argv) {
  // create a CLI runtime
  const cli = build()
    .brand('conder')
    .src(__dirname)
    .help() // provides default for help, h, --help, -h
    .version()
    .exclude(['strings', 'prompt', 'template', 'patching', 'package-manager'])
    .create()
  // and run it
  const toolbox = await cli.run(argv)

  // send it back (for testing, mostly)
  return toolbox
}

module.exports = { run }
