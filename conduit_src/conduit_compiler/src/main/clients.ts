// import { assertNever } from 'conduit_parser/dist/src/main/utils';
// import { CompiledTypes, Utilities } from 'conduit_parser';
// import { TypeWriter } from './type_writing/type_writer';

// export function generateClients(url: string, manifest: CompiledTypes.Manifest, models: string[]) {
//     const clients: string[] = []
//     manifest.inScope.forEach(fn => {
//         if (fn.kind !== "Function") {
//             return
//         }

//         let returnType = ''
//         let followOn = ''
//         let body =  ''
//         let paramString = ''
//         let beforeReq = ''
//         let method: "GET" | "POST" = "GET"
//         switch (fn.returnType.kind) {
//             case "CompleteType":
                
//                 returnType = `: Promise<${TypeWriter.typescript.reference(fn.returnType.differentiate(), manifest.inScope)}>`
//                 followOn = '.then( data=> data.json())'
//                 break
//             case "VoidReturnType":
//                 break

//             default: assertNever(fn.returnType)
//         }
//         const param = fn.parameter.differentiate()
//         switch (param.kind) {
//             case "NoParameter":
//                 break
//             case "UnaryParameter":
//                 paramString = `a: ${TypeWriter.typescript.reference(param.part.UnaryParameterType.part.CompleteType.differentiate(), manifest.inScope)}`
//                 beforeReq = 'const body = JSON.stringify(a)'
//                 body = `
//                 body,
//                 headers: {
//                     "content-type": "application/json",
//                     "content-length": \`\${body.length}\`
//                 },
//                 `
//                 method = "POST"

//                 break
//         }


//         clients.push(`
//         export function ${fn.name}(${paramString})${returnType} {
//             ${beforeReq}
//             return fetch("${url}/${fn.name}", {
//                 ${body}
//                 method: "${method}"
//             })${followOn}

//         }`) 
//     })
//     return  `
//         const url = '${url}'

//         ${models.join("\n")}

//         export function hello() {
//             return fetch(url)
//         }

//         ${clients.join("\n")}
//         `
// }