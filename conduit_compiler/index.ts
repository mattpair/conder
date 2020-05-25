/// <reference types="node" />

import * as fs from 'fs';
// import {compileFiles} from ""

try {
    const conduits: string[] = fs.readdirSync("./conduit/")
    if (conduits.length == 0) {
        console.warn("no files to compile")
    } else {
        console.log("HERE", conduits)
        const toCompile = {}
        conduits.forEach(c => toCompile[c] = fs.readFileSync(`./conduit/${c}`))
        fs.mkdirSync(".proto")
    }
} catch(e) {
    console.error("Unable to find conduit files in conduit/", e)
}
