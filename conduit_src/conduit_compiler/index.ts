import { compileFiles } from 'conduit_parser';

import {compile} from './src/main/statement_converter'
import {StrongServerEnv, RequiredEnv,} from 'conduit_kernel'

export {StrongServerEnv, RequiredEnv, Var, ServerEnv} from 'conduit_kernel'
export type CompileResponse = {
    kind: "success", env: Pick<StrongServerEnv, RequiredEnv>
  } | 
  {
    kind: "error", reason: string
  }
  
export function string_to_environment(conduit: string): CompileResponse {
    try {
        const manifest = compileFiles({input: () => conduit}, {project: "singleton", dependents: {}})
        return {kind: "success", env: compile(manifest)} 
    } catch (e) {
        return {kind: "error", reason: e.message}
    }
}