import { FunctionResolved } from '../../entity/resolved';
import * as fs from 'fs'

export function generateClients(url: string, manifest: FunctionResolved.Manifest, dir: string) {
    
    fs.writeFileSync(`${dir}/gen/clients.py`, 
`
import gen.models.default_namespace_pb2 as d
import requests
import json

def hello(): 
    return requests.get('${url}')

${manifest.service.functions.map(fn => {
    const param = fn.part.Parameter.differentiate() as FunctionResolved.UnaryParameter
return `
def ${fn.name}(a):
    s = json.dumps(d.${param.part.UnaryParameterType.differentiate().name}_to_dict(a))
    out = requests.post('${url}/${fn.name}', data=s, headers={"content-length": str(len(s)), "content-type": "application/json"})
    return out
`
    }).join("\n\n")}
`)
}