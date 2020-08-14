import { CompiledTypes, Utilities } from 'conduit_compiler';
import { RealType } from 'conduit_compiler/dist/src/main/entity/resolved';

export const a: string = `${12}`

function typeToTS(t: CompiledTypes.RealType):string {
    return `${t.val.name}${t.isArray ? "[]" : ""}`
}

export function generateClients(url: string, manifest: CompiledTypes.Manifest, models: string[]) {
    const clients: string[] = []
    // manifest.inScope.forEach(fn => {
    //     if (fn.kind !== "Function") {
    //         return
    //     }
    //     const ret = fn.returnType

    //     let returnType = ''
    //     let followOn = ''
    //     let body =  ''
    //     let paramString = ''
    //     let beforeReq = ''
    //     let method: "GET" | "POST" = "GET"

    //     switch(fn.operation.kind) {
    //         case "return input":
    //             returnType = `: Promise<${typeToTS(fn.returnType as RealType)}>`
    //             paramString = `a: ${typeToTS(fn.returnType as RealType)}`
    //             followOn = '.then( data=> data.json())'
    //             beforeReq = 'const body = JSON.stringify(a)'
    //             body = `
    //             body,
    //             headers: {
    //                 "content-type": "application/json",
    //                 "content-length": \`\${body.length}\`
    //             },
    //             `
    //             method = "POST"

    //             break
    //         case "insert":
                
    //             const store = manifest.inScope.getEntityOfType(fn.operation.storeName, "HierarchicalStore")
    //             paramString = `a: ${store.typeName}`
    //             beforeReq = 'const body = JSON.stringify(a)'
    //             body = `
    //             body,
    //             headers: {
    //                 "content-type": "application/json",
    //                 "content-length": \`\${body.length}\`
    //             },
    //             `
    //             method = "POST"
    //             break

    //         case "noop":
    //             break

    //         case "query":
    //             returnType = `: Promise<${typeToTS(fn.returnType as RealType)}>`
    //             followOn = '.then( data=> data.json())'
                
                
    //             break;
            

    //         default: Utilities.assertNever(fn.operation)
    //     }

    //     clients.push(`
    //     export function ${fn.name}(${paramString})${returnType} {
    //         ${beforeReq}
    //         return fetch("${url}/${fn.name}", {
    //             ${body}
    //             method: "${method}"
    //         })${followOn}

    //     }`) 
    // })
    return  `
        const url = '${url}'

        ${models.join("\n")}

        export function hello() {
            return fetch(url)
        }

        ${clients.join("\n")}
        `
}