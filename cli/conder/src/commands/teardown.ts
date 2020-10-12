
import { GluegunToolbox, GluegunCommand } from 'gluegun'
import { getClient } from '../helper'
  

const command: GluegunCommand = {
  name: 'teardown',
  alias: ['destroy'],
  run: async (toolbox: GluegunToolbox) => {
    const {
      parameters,
      print: { info, error },
    } = toolbox
    
    const deployment_name = parameters.first
    if (deployment_name === undefined) {
      error(`Expected a name to be provided as the first argument`)
      process.exit(1)
    }
    
    info(`Tearing down: ${deployment_name}`)

    const client = getClient(toolbox)
    const result = await client.delete<any>("/", 
      //TODO: eventually use the types in platform controller 
      {deployment_name}
    )
    if (result.ok) {
      info(`Deleted successfully`)
    } else {
      error(`Failure deleting. Please contact Conder Systems.`)
      process.exit(1)
    }
  },
}

module.exports = command
