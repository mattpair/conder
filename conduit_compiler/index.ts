/// <reference types="node" />

import * as fs from 'fs';

try {
    const dir: string[] = fs.readdirSync("./conduit/")
    if (dir.length == 0) {
        console.warn("no files to compile")
    }
} catch(e) {
    console.error("Unable to find conduit files in conduit/", e)
}
