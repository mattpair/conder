import { compileFiles, CompiledTypes } from 'conduit_parser';

import {compile} from './src/main/statement_converter'
import {StrongServerEnv, RequiredEnv, Var} from 'conduit_kernel'

export {StrongServerEnv, RequiredEnv, Var, ServerEnv} from 'conduit_kernel'

export type SuccessfulCompile = {
  kind: "success", 
  env: Pick<StrongServerEnv, Exclude<RequiredEnv, Var.DEPLOYMENT_NAME>>,
  manifest: CompiledTypes.Manifest
}
export type CompileResponse = SuccessfulCompile | 
  {
    kind: "error", reason: string
  }
  
export function string_to_environment(conduit: string): CompileResponse {
    try {
        const manifest = compileFiles({input: () => conduit}, {project: "singleton", dependents: {}})
        return {kind: "success", env: compile(manifest), manifest} 
    } catch (e) {
        return {kind: "error", reason: e.message}
    }
}
export {generateClients} from './src/main/clients'