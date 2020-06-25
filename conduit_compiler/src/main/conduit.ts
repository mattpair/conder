import { isError } from './error/types';
import * as fs from 'fs';
import { loadBuildConfig } from './config/load';
import { execute } from './cli';


function main() {
    let conduits: string[]

    const config = loadBuildConfig()
    if (isError(config)) {
        console.error(config.description)
        return
    }

    try {
        conduits = fs.readdirSync("./conduit/")
    } catch(e) {
        console.error("Unable to find ./conduit/")
        return
    }

    if (conduits.length == 0) {
        console.warn("no files to compile")
    } else {
        execute(conduits, config)
    }    
}

main()

