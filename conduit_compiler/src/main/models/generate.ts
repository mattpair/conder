import * as fs from 'fs';
import * as child_process from 'child_process';

import {toProto} from "../compile"
import { FunctionResolved } from '../entity/resolved';
import { ConduitBuildConfig } from 'config/load';
import { generateClients } from '../compute/gcp/clients';


// This is just a hack for now. I'm the only one running this.
// Revisit once productionizing.
const DEPENDENCY_DIR = '/Users/jerm/ConderSystems/conduit/conduit_compiler/src/main/deps'

export async function generateModelsToDirectory(manifest: FunctionResolved.Manifest, dir: string): Promise<void> {
    if (!fs.existsSync(".proto")) {
        fs.mkdirSync(".proto")
        await fs.promises.writeFile(`.proto/default_namespace.proto`, toProto(manifest).proto)
    }

    child_process.execSync(`mkdir -p ${dir}/gen/models`)
    child_process.execSync(`touch ${dir}/gen/models/__init__.py`)
    child_process.execSync(`${DEPENDENCY_DIR}/proto/bin/protoc -I=.proto/ --python_out=${dir}/gen/models default_namespace.proto 2>&1`, {encoding: "utf-8"})    
}

export async function generateModels(manifest: FunctionResolved.Manifest, config: ConduitBuildConfig): Promise<void> {
    for (const dir in config.dependents) {
        await generateModelsToDirectory(manifest, dir)
    }
}

export async function generateModelsAndClients(manifest: FunctionResolved.Manifest, config: ConduitBuildConfig, url: string): Promise<void> {
    await generateModels(manifest, config)
    for (const dir in config.dependents) {
        await generateModelsToDirectory(manifest, dir).then(() => generateClients(url, manifest, dir))   
    }
}