import { CompiledTypes, Utilities } from 'conduit_compiler';
import { RealType } from 'conduit_compiler/dist/src/main/entity/resolved';

export const a: string = `${12}`

function typeToTS(t: CompiledTypes.RealType):string {
    return `${t.val.name}${t.isArray ? "[]" : ""}`
}

export function generateClients(url: string, manifest: CompiledTypes.Manifest, models: string[]) {
    const clients: string[] = []
    manifest.inScope.forEach(fn => {
        if (fn.kind !== "Function") {
            return
        }

        let returnType = ''
        let followOn = ''
        let body =  ''
        let paramString = ''
        let beforeReq = ''
        let method: "GET" | "POST" = "GET"
        switch (fn.returnType.kind) {
            case "real type":
                returnType = `: Promise<${typeToTS(fn.returnType)}>`
                followOn = '.then( data=> data.json())'
                break
            case "VoidReturnType":
                break
        }
        const param = fn.parameter.differentiate()
        switch (param.kind) {
            case "NoParameter":
                break
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
                method = "POST"

                break
        }


        clients.push(`
        export function ${fn.name}(${paramString})${returnType} {
            ${beforeReq}
            return fetch("${url}/${fn.name}", {
                ${body}
                method: "${method}"
            })${followOn}

        }`) 
    })
    return  `
        const url = '${url}'

        ${models.join("\n")}

        export function hello() {
            return fetch(url)
        }

        ${clients.join("\n")}
        `
}