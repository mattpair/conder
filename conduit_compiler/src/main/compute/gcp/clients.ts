import { FunctionResolved, Message } from '../../entity/resolved';
import * as fs from 'fs'

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
            const param = fn.part.Parameter.differentiate() as FunctionResolved.UnaryParameter
            const type = param.part.UnaryParameterType.differentiate() as Message
            const ret = fn.part.ReturnTypeSpec.differentiate()

            let returnType = ''
            let followOn = ''
            switch (ret.kind) {
                case "Message":
                    returnType = `: Promise<models.${ret.name}>`
                    followOn = '.then( data=> data.json())'
                    break;
                case "Enum":
                    throw Error("dont support enum")
                case "VoidReturnType":
                    break;
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