import { Utilities } from 'conduit_parser';
import * as fs from 'fs';


export type ConduitBuildConfig = {
    project: string;
    dependents?: {
        [path in string]: {
            language: "typescript";
        };
    };
};


export const loadBuildConfig: Utilities.StepDefinition<{}, {buildConf: ConduitBuildConfig}> = {
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