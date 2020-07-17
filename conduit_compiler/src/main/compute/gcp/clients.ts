import { FunctionResolved } from '../../entity/resolved';
import {modelAliasOf} from './deploy'
import * as fs from 'fs'

export function generateClients(url: string, manifest: FunctionResolved.Manifest, dir: string) {
    
    fs.writeFileSync(`${dir}/gen/clients.py`, 
`
import gen.models.default_namespace_pb2 as d
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