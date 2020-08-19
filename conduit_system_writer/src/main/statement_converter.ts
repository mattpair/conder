import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { OpFactory, OpInstance } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes } from "conduit_compiler";
import { Parameter } from 'conduit_compiler/dist/src/main/entity/resolved';

export type WritableFunction = Readonly<{
    name: string
    method: "POST" | "GET"
    body: OpInstance[],
    parameter: Parameter
}>

export const functionToByteCode: Utilities.StepDefinition<
{manifest: CompiledTypes.Manifest, opFactory: OpFactory}, 
{functions: WritableFunction[]}> = {
    stepName: "Converting function to byte code",
    func({manifest, opFactory}) {   

        const functions: WritableFunction[] = []
        const gatheredFunctions: CompiledTypes.Function[] = []
        manifest.inScope.forEach(f => {
            if (f.kind === "Function") {
                gatheredFunctions.push(f)
            }
        })

        gatheredFunctions.forEach(f => functions.push(convertFunction(f, opFactory)))
        
        return Promise.resolve({functions})
    }
}

function convertFunction(f: CompiledTypes.Function, factory: OpFactory): WritableFunction {
    const body: OpInstance[] = []

    for (let j = 0; j < f.body.statements.length; j++) {
        const stmt = f.body.statements[j]
        switch(stmt.kind) {
            
            case "Append":
                body.push(factory.makeInsert(stmt.into, stmt.inserting.name))
                break
            
            case "ReturnStatement":
                const nextStmtI = j < f.body.statements.length - 1 ? j + 1 : -1
                if (nextStmtI === -1){
                    break
                }
                const next = f.body.statements[nextStmtI]
                switch (next.kind) {
                    case "Append":
                        // This will be handled in the next loop
                        // We don't need to do anything about the return.
                        continue
                    case "ReturnStatement":
                        console.error("Double return statement")
                        continue
                    case "StoreReference":
                        body.push(
                            factory.makeQuery(next.from)
                        )
                        body.push(
                            factory.makeReturnPrevious()
                        )
                        break
                    case "VariableReference":
                        body.push(factory.makeReturnVariableOp(next.name))
                        break
                    default: assertNever(next)
                }
                // No need to examine the already handled statement
                j++;
                break

            default: continue
        }
    }

    return {
        name: f.name,
        method: f.method,
        body,
        parameter: f.parameter
    }
}