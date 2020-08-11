import { CompiledTypes, Utilities } from 'conduit_compiler';

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

            default: Utilities.assertNever(param)
        }
        switch (ret.kind) {
            case "real type":
                returnType = `: Promise<${typeToTS(ret)}>`
                followOn = '.then( data=> data.json())'
                break;
            case "VoidReturnType":
                break;

            default: Utilities.assertNever(ret)
        }

        clients.push(`
        export function ${fn.name}(${paramString})${returnType} {
            ${beforeReq}
            return fetch("${url}/${fn.name}", {
                ${body}
                method: "${fn.method}"
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