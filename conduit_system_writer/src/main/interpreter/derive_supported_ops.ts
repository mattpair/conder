import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from '../sql'
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { writeOperationInterpreter } from './interpreter_writer';


type Instr<s extends string, DATA={}> = Readonly<{kind: s} & DATA>

export type AnyOp = 
| Instr<"insert", {storeName: string}>
| Instr<"query", {storeName: string}>
| Instr<"return", {name: string}> 
| Instr<"returnPrevious">


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
                        {kind: "insert", storeName: i.name}, 
                        {kind: "query", storeName: i.name})
                    break
                default: assertNever(i)
            }
        })

        return Promise.resolve({supportedOps: addedOperations })
    }
}