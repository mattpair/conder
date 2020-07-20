import { StartupError } from "error/types";
import * as fs from 'fs';

export type ConduitBuildConfig = {
    project: string,
    dependents?: {
        [path in string]: {
            language: "python"
        }
    }
}

export function loadBuildConfig(): ConduitBuildConfig | StartupError {
    if (fs.existsSync("cdtconfig.json")) {
        const raw = fs.readFileSync("cdtconfig.json", {encoding: "utf-8"})
        // TODO: actually validate.
        const json: ConduitBuildConfig = JSON.parse(raw)
        return json
    } else {
        return {
            isError: true,
            description: "Unable to find config file (cdtconfig.json) in present directory."
        }
    }
}