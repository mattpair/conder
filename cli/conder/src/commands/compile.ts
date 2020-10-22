
import { GluegunToolbox, GluegunCommand } from 'gluegun'
import {string_to_environment} from 'conduit_compiler'  

const command: GluegunCommand = {
  name: 'compile',
  alias: ['c'],
  run: async (toolbox: GluegunToolbox) => {
    const {
      parameters,
      print: { info, error },
      filesystem,
    } = toolbox
    
    const deployment_name = parameters.first === undefined ? "app" : parameters.first
    const artifact_name = `${deployment_name}.json`
    info(`Writing artifacts to ${artifact_name}`)
    
    const conduit = filesystem.read("main.cdt")
    if (conduit === undefined) {
      error(`Could not find required file main.cdt`)
      process.exit(1)
    }
    const output = string_to_environment(conduit)
    switch (output.kind) {
      case "success":
        filesystem.write(artifact_name, JSON.stringify(output.env))
        break
      case "error":
        error(output.reason)
        process.exit(1)
    }
  }
}

module.exports = command
