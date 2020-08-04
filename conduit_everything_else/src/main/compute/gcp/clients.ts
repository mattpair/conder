import { CompiledTypes } from 'conduit_compiler';

import * as fs from 'fs'
import { assertNever } from '../../util/classifying';

export const a: string = `${12}`

function typeToTS(t: CompiledTypes.RealType):string {
    return `models.${t.val.name}${t.isArray ? "[]" : ""}`
}

export function generateClients(url: string, manifest: CompiledTypes.Manifest, dir: string) {
    
    fs.writeFileSync(`${dir}/clients.ts`, 
        `
        import * as models from './models'
        const url = '${url}'

        export function hello() {
            return fetch(url)
        }

        ${manifest.service.functions.map(fn => {
            const param = fn.parameter.differentiate()
            const ret = fn.returnType

            let returnType = ''
            let followOn = ''
            let body =  ''
            let paramString = ''
            let beforeReq = ''

            switch(param.kind) {
                case "UnaryParameter":
                    paramString = `a: ${typeToTS(param.type)}`
                    beforeReq = 'const body = JSON.stringify(a)'
                    body = `
                    body,
                    headers: {
                        "content-type": "application/json",
                        "content-length": \`\${body.length}\`
                    },
                    `
                    break;
                case "NoParameter":
                    break;

                default: assertNever(param)
            }
            switch (ret.kind) {
                case "real type":
                    returnType = `: Promise<${typeToTS(ret)}>`
                    followOn = '.then( data=> data.json())'
                    break;
                case "VoidReturnType":
                    break;

                default: assertNever(ret)
            }
    
            return `
            export function ${fn.name}(${paramString})${returnType} {
                ${beforeReq}
                return fetch("${url}/${fn.name}", {
                    ${body}
                    method: "${fn.method}"
                })${followOn}

            }`}).join("\n")}
        `
    )
}