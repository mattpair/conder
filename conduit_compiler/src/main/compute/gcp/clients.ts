import { FunctionResolved } from '../../entity/resolved';
import {modelAliasOf} from './deploy'
import * as fs from 'fs'

export function generateClients(url: string, manifest: FunctionResolved.Manifest, dir: string) {
    
    fs.writeFileSync(`${dir}/gen/clients.py`, 
`
${manifest.files.filter(f => f.inFileScope.size > 0).map(f => `import gen.models.${f.loc.fullname.replace(".cdt", "_pb2")} as ${modelAliasOf(f.loc)}`).join("\n")}
import requests


def hello(): 
    return requests.get('${url}')

${manifest.service.functions.map(fn => {
    const param = fn.part.Parameter.differentiate()
return `
def ${fn.name}(a):
    out = requests.post('${url}/${fn.name}/', data=a.SerializeToString())
    return out
`
    }).join("\n\n")}
`)
}