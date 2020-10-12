
import { GluegunCommand } from 'gluegun'


const command: GluegunCommand = {
  name: 'conder',
  run: async toolbox => {
    const { print } = toolbox

    print.info('Welcome to Conder')
  },
}

module.exports = command
