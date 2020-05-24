/// <reference types="node" />

import * as fs from 'fs';

try {
    const dir: string[] = fs.readdirSync("./conduit/")
    console.log("success")
} catch(e) {
    console.error("Unable to find conduit files in conduit/", e)
}
