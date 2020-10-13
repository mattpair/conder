
import { Parse} from "./parse";
import { Manifest, EntityMap } from "./entity/resolved";
import { ConduitBuildConfig } from "./entity/ConduitBuildConfig";
import { toEntityMap, PartialEntityMap } from "./resolution/typeValidation";
import { FileLocation } from "./utils";
import { generateSystemObjects,  } from "./resolution/generateSystemStructs";

//TODO: rename this and simplify so it only takes one string.
export function compileFiles(files: Record<string, () => string>, build: ConduitBuildConfig): Manifest {
    const conduits: Parse.File[] = []
    for (const file in files) {
        conduits.push(Parse.extractAllFileEntities(files[file](), new FileLocation(file)))
    }
    const mapAndSchemaFactory = toEntityMap(conduits)
        
    return {inScope: new EntityMap(generateSystemObjects(mapAndSchemaFactory[0])), schemaFactory: mapAndSchemaFactory[1]}
} 