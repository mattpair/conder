const { build } = require('gluegun')

/**
 * Create the cli and kick it off
 */
async function run(argv) {
  // create a CLI runtime
  const cli = build()
    .brand('conder')
    .src(__dirname)
    .plugins('./node_modules', { matching: 'conder-*', hidden: true })
    .help() // provides default for help, h, --help, -h
    .create()
    .exclude(['meta', 'strings', 'print', 'filesystem', 'system', 'prompt', 'http'])
  // and run it
  const toolbox = await cli.run(argv)

  // send it back (for testing, mostly)
  return toolbox
}

module.exports = { run }
