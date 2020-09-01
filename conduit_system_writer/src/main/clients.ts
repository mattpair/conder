import { CompiledTypes, Utilities } from 'conduit_parser';

export const a: string = `${12}`

function typeToTS(t: CompiledTypes.ResolvedType):string {
    switch (t.kind) {
        case "Primitive":
            throw Error(`Currently don't support primitive inputs and outputs`)

        case "CustomType":
            return `${t.type}${t.modification === "array" ? "[]" : ""}`

        default: Utilities.assertNever(t)
    }
    
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
            case "CustomType":
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