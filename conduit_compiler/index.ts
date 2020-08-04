import { compileFiles } from './src/main/compile';

import { Parse} from "./src/main/parse";
import { FunctionResolved, } from "./src/main/entity/resolved";
import { toNamespace } from "./src/main/resolution/resolveTypes";
import { FileLocation } from "./src/main/util/filesystem";
import { resolveFunctions } from "./src/main/resolution/resolveFunction";

export {compileFiles}
export * as CompiledTypes from './src/main/entity/resolved'
export * as Lexicon from './src/main/lexicon'