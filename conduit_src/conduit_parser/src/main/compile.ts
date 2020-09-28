
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
    const mapAndSchemaFactory = toEntityMap(conduits)
    const map: PartialEntityMap<Python3Install>  = generateSystemObjects(mapAndSchemaFactory[0])
    
    
    return {inScope: new EntityMap(map), schemaFactory: mapAndSchemaFactory[1]}
} 