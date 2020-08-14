import { assertNever } from '../utils';
import { PreProcedurization, Manifest, Entity, AnyOp, EntityMap } from "../entity/resolved";


export function procedurize(input: PreProcedurization.ScopeMap): Manifest {

    const inScope: Map<string, Entity> = new Map()
    const addedOperations: AnyOp[] = [
    ]

    input.forEach(i => {
        switch(i.kind) {
            case "Enum":
            case "Struct":
                inScope.set(i.name, i)
                break

            case "HierarchicalStore":
                inScope.set(i.name, i)
                addedOperations.push(
                    {type: "instr", kind: "insert", storeName: i.name}, 
                    {type: "instr", kind: "query", storeName: i.name})
                break
            case "Function":
                break
            default: assertNever(i)
        }
    })

    return {
        supportedOperations: addedOperations,
        inScope: new EntityMap(inScope)
    }
}

// function convertToOps(i: PreProcedurization.Function): AnyOp[] {
//     if (i.body.statements.length === 0) {
//         return []
//     }

//     const param =i.parameter.differentiate()
//     if (param.kind === "NoParameter") {
    
//         const ref = i.body.statements[i.body.statements.length - 1]
//         if (ref.kind === "StoreReference") {
//             return [{
//                 type: "instr",
//                 kind: "query",
//                 storeName: ref.from.name
//             }, {type: "control flow", kind: 'return', name: "__query"}]
//         }
        
//     } else {
//         const insert = i.body.statements.find(s => s.kind === "Append") as PreProcedurization.Append
//         if (insert !== undefined) {
//             return [{
//                 type: "instr",
//                 kind: "insert",
//                 storeName: insert.into.name
//             }]
//         }
//         return [{
//             type: "control flow",
//             kind: "return",
//             name: "__input"
//         }]
//     }
// }