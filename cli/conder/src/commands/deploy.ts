
import { GluegunToolbox, GluegunCommand } from 'gluegun'
  

const command: GluegunCommand = {
  name: 'deploy',
  alias: ['d'],
  run: async (toolbox: GluegunToolbox) => {
    const {
      parameters,
      print: { info },
    } = toolbox
    info("Starting deployment")

    const name = parameters.first

    

    info(`Generated file at models/${name}-model.ts`)
  },
}

module.exports = command
