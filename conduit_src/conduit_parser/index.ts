import { compileFiles } from './src/main/compile';
import { SchemaInstance, SchemaType } from './src/main/SchemaFactory';

export {compileFiles}
export * as CompiledTypes from './src/main/entity/resolved'
export * as Lexicon from './src/main/lexicon'
export * as Utilities from './src/main/utils'
export {Parse} from './src/main/parse'
export {ConduitBuildConfig} from './src/main/entity/ConduitBuildConfig'

export type AnySchemaInstance = SchemaInstance<SchemaType>
export type Schemas = AnySchemaInstance[]
export  { SchemaInstance, SchemaType, schemaFactory } from './src/main/SchemaFactory';
