import { StepDefinition } from './../util/sequence';
import { Message, Enum } from './../entity/resolved';
import * as fs from 'fs';
import * as child_process from 'child_process';

import { FunctionResolved } from '../entity/resolved';
import { ConduitBuildConfig } from 'config/load';
import { generateClients } from '../compute/gcp/clients';
import { assertNever } from '../util/classifying';
import { Symbol } from '../lexicon';


function modelFor(ent: Message | Enum): string {
    switch(ent.kind) {
        case "Enum":
            return `
                export enum ${ent.name} {
                    ${ent.children.EnumMember.map(e => e.name).join("\n")}
                }
                `
    
        case "Message":
            return `
                export type ${ent.name} = {
                    ${ent.children.Field.map(f => {
                        const type = f.part.FieldType.differentiate()
                        switch (type.kind) {
                            case "Primitive":
                                let primstring = ''
                                switch (type.val) {
                                    case Symbol.bool:
                                        primstring = 'boolean'
                                        break;
                                    case Symbol.bytes:
                                        throw Error("bytes not yet supported")
                                    case Symbol.double:
                                    case Symbol.float:
                                    case Symbol.int32:
                                    case Symbol.int64:
                                    case Symbol.uint32:
                                    case Symbol.uint64:
                                        primstring = 'number'
                                        break;
                                    case Symbol.string:
                                        primstring = 'string'
                                        break;

                                    default: assertNever(type.val)
                                }

                                return `${f.name}: ${primstring}`
                            case "Enum":
                            case "Message":
                                return `${f.name}: ${type.name}`

                            default: assertNever(type)
                        }

                    }).join("\n")}
                }`
    }
}

export async function generateModelsToDirectory(manifest: FunctionResolved.Manifest, dir: string): Promise<void> {
    const models: string[] = []
    manifest.namespace.inScope.forEach(v => {
        if (v.kind === "Function") {
            return
        }
        models.push(modelFor(v))
    })

    child_process.execSync(`mkdir -p ${dir}`)
    
    fs.writeFileSync(`${dir}/models.ts`, models.join('\n\n'))
}

export const generateModels: StepDefinition<{manifest: FunctionResolved.Manifest, buildConf: ConduitBuildConfig}, {}> = {
    stepName: "generateModels",
    func: ({manifest, buildConf}) => {
        const promises = []
        for (const dir in buildConf.dependents) {
            promises.push(generateModelsToDirectory(manifest, dir))
        }
        return Promise.all(promises).then(() => ({}))
    }

}


export const generateAllClients: StepDefinition<{manifest: FunctionResolved.Manifest, buildConf: ConduitBuildConfig, endpoint: string}, {}> = {
    stepName: "generating all clients",
    func: ({manifest, buildConf, endpoint}) => {
        const p = []
        for (const dir in buildConf.dependents) {
            generateClients(endpoint, manifest, dir)
        }
        return Promise.resolve({})
    }
    
}