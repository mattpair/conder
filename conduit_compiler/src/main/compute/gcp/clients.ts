import { TypeResolved } from '../../entity/resolved';
import {modelAliasOf} from './deploy'
import * as fs from 'fs'

export function generateClients(url: string, files: TypeResolved.File[]) {
    
    fs.writeFileSync("clients/__init__.py", "")
    fs.writeFileSync("clients/clients.py", 
`
${files.filter(f => f.inFileScope.size > 0).map(f => `import models.${f.loc.fullname.replace(".cdt", "_pb2")} as ${modelAliasOf(f)}`)}
import requests


def hello(): 
    return requests.get('${url}')

${files.map(file => file.children.Function.map(fn => {
    const param = fn.part.Parameter.differentiate()
return `
def ${fn.name}(a):
    out = requests.post('${url}/${fn.name}/', data=a.SerializeToString())
    return out
`
    }).join("\n")).join("\n\n")}
`)
}