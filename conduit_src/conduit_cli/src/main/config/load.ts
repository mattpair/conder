import { Utilities, CompiledTypes, ConduitBuildConfig } from 'conduit_parser';
import * as fs from 'fs';

export function loadBuildConfig(): ConduitBuildConfig {
    
    if (fs.existsSync("cdtconfig.json")) {
        const raw = fs.readFileSync("cdtconfig.json", {encoding: "utf-8"})
        // TODO: actually validate.
        const buildConf: ConduitBuildConfig = JSON.parse(raw)
        if (!buildConf.dependents) {
            throw Error("Please specify a dependent in your conduit config so I know where to put models.")
        }
        if (buildConf.install === undefined) {
            console.warn("Cannot find the install list")
            buildConf.install = []
        }
        

        buildConf.install.forEach(i => {
            if(!fs.existsSync(i.reldir)) {
                throw Error(`Cannot find relative dir for install ${i.reldir}`)
            }
            if (!/.*\.py$/.test(i.file)) {
                throw Error(`selected file is not python: ${i.file}`)
            }
            if(!fs.existsSync(`${i.reldir}/${i.file}`)) {
                throw Error(`Cannot find file in relative dir`)
            }
        })
        return buildConf
    } else {
        throw Error("Unable to find config file (cdtconfig.json) in present directory.")
    }
}