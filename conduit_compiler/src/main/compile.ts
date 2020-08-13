
import { Parse} from "./parse";
import { Manifest } from "./entity/resolved";
import { toNamespace } from "./resolution/resolveTypes";
import { FileLocation } from "./utils";
import { resolveFunctions } from "./resolution/resolveFunction";
import {procedurize} from "./resolution/procedurization"

export function compileFiles(files: Record<string, () => string>): Manifest {
    const conduits: Parse.File[] = []
    for (const file in files) {
        conduits.push(Parse.extractAllFileEntities(files[file](), new FileLocation(file)))
    }

    return procedurize(resolveFunctions(toNamespace(conduits)))
} 