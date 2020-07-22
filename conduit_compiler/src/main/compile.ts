
import { Parse} from "./parse";
import { FunctionResolved, } from "./entity/resolved";
import { toNamespace } from "./resolution/resolveTypes";
import { FileLocation } from "./util/filesystem";
import { resolveFunctions } from "./resolution/resolveFunction";

export function compileFiles(files: Record<string, () => string>): FunctionResolved.Manifest {
    const conduits: Parse.File[] = []
    for (const file in files) {
        
        if (file.endsWith(".cdt")) {
            conduits.push(Parse.extractAllFileEntities(files[file](), new FileLocation(file)))
        }
    }

    return resolveFunctions(toNamespace(conduits))
} 
