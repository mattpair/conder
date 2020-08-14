import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from '../sql'
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { writeOperationInterpreter } from '../interpreter_writer';


export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, {supportedOps: CompiledTypes.AnyOp[]}> = {
    stepName: "deriving supported operations",
    func: ({manifest}) => {
        const addedOperations: CompiledTypes.AnyOp[] = [
        ]

        manifest.inScope.forEach(i => {
            switch(i.kind) {
                case "Enum":
                case "Struct":
                    break
    
                case "HierarchicalStore":
                    addedOperations.push(
                        {type: "instr", kind: "insert", storeName: i.name}, 
                        {type: "instr", kind: "query", storeName: i.name})
                    break
                default: assertNever(i)
            }
        })

        return Promise.resolve({supportedOps: addedOperations })
    }
}