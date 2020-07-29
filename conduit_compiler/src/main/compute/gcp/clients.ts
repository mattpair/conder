import {  } from './../../parse';
import { FunctionResolved, Struct } from '../../entity/resolved';
import * as fs from 'fs'
import { assertNever } from '../../util/classifying';

export const a: string = `${12}`

export function generateClients(url: string, manifest: FunctionResolved.Manifest, dir: string) {
    
    fs.writeFileSync(`${dir}/clients.ts`, 
        `
        import * as models from './models'
        const url = '${url}'

        export function hello() {
            return fetch(url)
        }

        ${manifest.service.functions.map(fn => {
            const param = fn.parameter.differentiate() as FunctionResolved.UnaryParameter
            const type = param.part.UnaryParameterType.differentiate() as Struct
            const ret = fn.returnType

            let returnType = ''
            let followOn = ''
            switch (ret.kind) {
                case "Struct":
                    returnType = `: Promise<models.${ret.name}>`
                    followOn = '.then( data=> data.json())'
                    break;
                case "VoidReturnType":
                    break;

                default: assertNever(ret)
            }
    
            return `
            export function ${fn.name}(a: models.${type.name})${returnType} {
                const body = JSON.stringify(a)
                return fetch("${url}/${fn.name}", {
                    body,
                    headers: {
                        "content-type": "application/json",
                        "content-length": \`\${body.length}\`
                    },
                    method: "POST"
                })${followOn}

            }`}).join("\n")}
        `
    )
}