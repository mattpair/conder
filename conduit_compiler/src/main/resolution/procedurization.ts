import { assertNever } from '../utils';
import { PreProcedurization, Manifest, Entity, Operation, EntityMap } from "../entity/resolved";


export function procedurize(input: PreProcedurization.ScopeMap): Manifest {

    const inScope: Map<string, Entity> = new Map()
    const supportedOperations: Operation[] = [{kind: "return input"}, {kind: "noop"}]

    input.forEach(i => {
        switch(i.kind) {
            case "Enum":
            case "Struct":
                inScope.set(i.name, i)
                break

            case "HierarchicalStore":
                inScope.set(i.name, i)
                supportedOperations.push({kind: "insert", storeName: i.name}, {kind: "get all", storeName: i.name})
                break
            case "Function":
                const operation: Operation = convertToOp(i)
                
                
                if (operation === undefined) {
                    throw Error(`Unable to convert function ${i.name} into an operation`)
                }
                inScope.set(i.name, {
                    kind: "Function",
                    name: i.name,
                    operation,
                    returnType: i.returnType
                })
                break
            default: assertNever(i)
        }
    })

    return {
        supportedOperations,
        inScope: new EntityMap(inScope)
    }
}

function convertToOp(i: PreProcedurization.Function): Operation | undefined {
    if (i.body.statements.length === 0) {
        return {
            kind: "noop"
        }
    }

    const param =i.parameter.differentiate()
    if (param.kind === "NoParameter") {
    
        const ref = i.body.statements[i.body.statements.length - 1]
        if (ref.kind === "StoreReference") {
            return {
                kind: "get all",
                storeName: ref.from.name
            }
        }
        
    } else {
        const insert = i.body.statements.find(s => s.kind === "Append") as PreProcedurization.Append
        if (insert !== undefined) {
            return {
                kind: "insert",
                storeName: insert.into.name
            }
        }
        return {
            kind: "return input"
        }
    }
}