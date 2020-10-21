import { AnySchemaInstance, Lexicon, Utilities } from 'conduit_parser';
import { CompiledTypes } from 'conduit_parser';

export function generateClients(url: string, manifest: CompiledTypes.Manifest) {
    const clients: string[] = []
    manifest.inScope.forEach(fn => {
        if (fn.kind !== "Function") {
            return
        }
        const annotate = generateClientTypedef(fn)
        const followOn = fn.returnType.kind !== "VoidReturnType" ? '.then( data=> data.json())' : ""
        let body =  ''
        let paramString = 'a'
        let beforeReq = ''
        const method = "PUT"
        const param = fn.parameter
        switch (param.kind) {
            case "NoParameter":
                paramString = ``
            case "WithParam":
                
                // { kind: "Exec", data: { proc: f, arg: arg  === undefined ? interpeterTypeFactory.None :  } }
                beforeReq = `const body = JSON.stringify({
                    kind: "Exec", 
                    data: {"proc": "${fn.name}", arg: ${param.kind === "NoParameter" ? "null" : "a"}}})`
                body = `
                body,
                headers: {
                    "content-type": "application/json",
                    "content-length": \`\${body.length}\`
                },
                `

                break
        }


        clients.push(`
        export function ${fn.name}(${paramString}${annotate.parameter})${annotate.return} {
            ${beforeReq}
            return fetch("${url}/", {
                ${body}
                method: "${method}"
            })${followOn}

        }`) 
    })
    return  `
        const url = '${url}'


        ${clients.join("\n")}
        `
}

function schemaToTypedef(schema: AnySchemaInstance): string {
    switch (schema.kind) {
        case "Array":
            return `${schemaToTypedef(schema.data[0])}[]`
        case "Object":
            const inner = Object.keys(schema.data).map(k => `${k}: ${schemaToTypedef(schema.data[k])}`)

            return `{
                ${inner.join("\n")}
            }`
        case "Optional":
            return `${schemaToTypedef(schema.data[0])} | null`
        case Lexicon.Symbol.bool:
            return 'boolean'
        case Lexicon.Symbol.double:
            return 'number'
        case Lexicon.Symbol.int:
            return 'number'
        case Lexicon.Symbol.string:
            return 'string'

        default: Utilities.assertNever(schema)
    }
}

type TypeAnnotation = Readonly<{parameter: string, return: string}>

function generateClientTypedef(func: CompiledTypes.Function): TypeAnnotation {
    const ret: string[] = []
    
    let sParam = ''
    let sReturn = ''
        
    const p = func.parameter
    switch (p.kind) {
        case "WithParam":
            sParam = `: ${schemaToTypedef(p.schema)}`
    }
    const r: CompiledTypes.RetType=  func.returnType
    switch (r.kind) {
        case "VoidReturnType":
            sReturn = `: Promise<any>`
            break
        default:
            sReturn = `: Promise<${schemaToTypedef(r)}>`
    }

    return {parameter: sParam, return: sReturn}
            
}