import { Utilities, CompiledTypes, ConduitBuildConfig } from 'conduit_parser';
import * as fs from 'fs';

export function loadBuildConfig(): ConduitBuildConfig {
    
    if (fs.existsSync("cdtconfig.json")) {
        const raw = fs.readFileSync("cdtconfig.json", {encoding: "utf-8"})
        // TODO: actually validate.
        const buildConf: ConduitBuildConfig = JSON.parse(raw)
        if (!buildConf.dependents) {
            throw Error("Please specify a dependent in your conduit config so I know where to put clients.")
        }
        
        return buildConf
    } else {
        throw Error("Unable to find config file (cdtconfig.json) in present directory.")
    }
}