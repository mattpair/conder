import { StartupError } from "error/types";
import * as fs from 'fs';
import { StepDefinition } from "util/sequence";

export type ConduitBuildConfig = {
    project: string,
    dependents?: {
        [path in string]: {
            language: "python"
        }
    }
}

export const loadBuildConfig: StepDefinition<{}, {buildConf: ConduitBuildConfig}> = {
    stepName: "loadBuildConfig",
    func: () => {
        if (fs.existsSync("cdtconfig.json")) {
            const raw = fs.readFileSync("cdtconfig.json", {encoding: "utf-8"})
            // TODO: actually validate.
            const buildConf: ConduitBuildConfig = JSON.parse(raw)
            if (!buildConf.dependents) {
                console.warn("Please specify a dependent in your conduit config so I know where to put models.")
                process.exit(1)
            }
            return Promise.resolve({buildConf})
        } else {
            return Promise.reject("Unable to find config file (cdtconfig.json) in present directory.")
        }
    }
}