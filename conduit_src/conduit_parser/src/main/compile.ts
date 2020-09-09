
import { Parse} from "./parse";
import { Manifest, Python3Install, EntityMap } from "./entity/resolved";
import { ConduitBuildConfig } from "./entity/ConduitBuildConfig";
import { toEntityMap, PartialEntityMap } from "./resolution/typeValidation";
import { FileLocation } from "./utils";
import { generateSystemObjects,  } from "./resolution/generateSystemStructs";

export function compileFiles(files: Record<string, () => string>, build: ConduitBuildConfig): Manifest {
    const conduits: Parse.File[] = []
    for (const file in files) {
        conduits.push(Parse.extractAllFileEntities(files[file](), new FileLocation(file)))
    }
    const map: PartialEntityMap<Python3Install>  = generateSystemObjects(toEntityMap(conduits))
    
    if (build.install) {
        build.install.forEach(i => {
            const g = map.get(i.name)
            if(g) {
                throw Error(`Install name ${i.name} collides with ${g.kind} ${g.name}`)
            }
            map.set(i.name, i)
        })
    }
    
    return {inScope: new EntityMap(map)}
} 