import { CompiledTypes } from 'conduit_parser';

export function generateClients(url: string, manifest: CompiledTypes.Manifest) {
    const clients: string[] = []
    manifest.inScope.forEach(fn => {
        if (fn.kind !== "Function") {
            return
        }

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
        export function ${fn.name}(${paramString}) {
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