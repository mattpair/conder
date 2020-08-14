import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from '../sql'
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { writeOperationInterpreter } from './interpreter_writer';


type Instr<s extends string, DATA={}> = Readonly<{type: "instr", kind: s} & DATA>

export type AnyOp = 
| Instr<"insert", {storeName: string}>
| Instr<"query", {storeName: string}>
| Readonly<{type: "control flow", kind: "return", name: string} | {type: "control flow", kind: "return previous"}>


export const deriveSupportedOperations: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, {supportedOps: AnyOp[]}> = {
    stepName: "deriving supported operations",
    func: ({manifest}) => {
        const addedOperations: AnyOp[] = [
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