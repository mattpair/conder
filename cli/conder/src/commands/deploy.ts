
import { GluegunToolbox, GluegunCommand } from 'gluegun'
import { getClient } from '../helper'
  

const command: GluegunCommand = {
  name: 'deploy',
  alias: ['d'],
  run: async (toolbox: GluegunToolbox) => {
    const {
      parameters,
      print: { info, error },
      filesystem,
    } = toolbox
    
    const deployment_name = parameters.first
    if (deployment_name === undefined) {
      error(`Expected a name to be provided as the first argument`)
      process.exit(1)
    }
    
    const conduit = filesystem.read("main.cdt")
    if (conduit === undefined) {
      error(`Could not find required file main.cdt`)
      process.exit(1)
    }
    info(`Deploying: ${deployment_name}`)

    const client = getClient(toolbox)
    const result = await client.post<any>("/", 
      //TODO: eventually use the types in platform controller 
      {deployment_name, conduit}
    )
    if (result.ok && result.data.kind === "success") {
      info(`System is reachable at ${result.data.url}`)
    } else if (result.data.kind === "error") {
      error(`Failed to deploy: ${result.data.reason}`)
      process.exit(1)
    } else {
      error(`Failure deploying. Please contact conder systems.`)
      process.exit(1)
    }
  },
}

module.exports = command
