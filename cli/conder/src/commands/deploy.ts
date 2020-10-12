
import { GluegunToolbox, GluegunCommand } from 'gluegun'
  

const command: GluegunCommand = {
  name: 'deploy',
  alias: ['d'],
  run: async (toolbox: GluegunToolbox) => {
    const {
      parameters,
      print: { info, error },
      filesystem
    } = toolbox
    const name = parameters.first
    if (name === undefined) {
      error(`Expected a name to be provided as the first argument`)
      process.exit(1)
    }
    info(`Deploying: ${name}`)

    const code = filesystem.read("main.cdt")
    if (code === undefined) {
      error(`Could not find required file main.cdt`)
      process.exit(1)
    }

    

    info(`Generated file at models/${name}-model.ts`)
  },
}

module.exports = command
