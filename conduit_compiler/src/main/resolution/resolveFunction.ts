import { TypeResolved } from "entity/resolved";


// function validateFunctions(files: TypeResolved.File[]) {
//     files.forEach(file => {
//         file.children.Function.forEach(func => {
//             if (file.importAliasToFile.has(func.name) || file.entityLookup.has(func.name)) {
//                 throw new Error(`Function ${func.name} duplicates another entity in scope`)
//             }
//             func.part.ParameterList.children.Parameter(param => {
//                 if (file.importAliasToFile.has())
//             })
//         })
//     })
// }