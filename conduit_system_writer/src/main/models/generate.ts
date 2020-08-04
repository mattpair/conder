import * as fs from 'fs';
import * as child_process from 'child_process';

import { ConduitBuildConfig } from '../config/load';
import { generateClients } from '../clients';
import { Lexicon, CompiledTypes, Utilities } from 'conduit_compiler';

function modelFor(ent: CompiledTypes.Struct | CompiledTypes.Enum): string {
    switch(ent.kind) {
        case "Enum":
            return `
                export enum ${ent.name} {
                    ${ent.children.EnumMember.map(e => e.name).join("\n")}
                }
                `
    
        case "Struct":
            return `
                export type ${ent.name} = {
                    ${ent.children.Field.map(f => {
                        const type = f.part.FieldType.differentiate()

                        const tailer = f.isRequired ? "" : "| null"
                        switch (type.kind) {
                            case "Primitive":
                                let primstring = ''
                                switch (type.val) {
                                    case Lexicon.Symbol.bool:
                                        primstring = 'boolean'
                                        break;
                                    case Lexicon.Symbol.bytes:
                                        throw Error("bytes not yet supported")
                                    case Lexicon.Symbol.double:
                                    case Lexicon.Symbol.float:
                                    case Lexicon.Symbol.int32:
                                    case Lexicon.Symbol.int64:
                                    case Lexicon.Symbol.uint32:
                                    case Lexicon.Symbol.uint64:
                                        primstring = 'number'
                                        break;
                                    case Lexicon.Symbol.string:
                                        primstring = 'string'
                                        break;

                                    default: Utilities.assertNever(type.val)
                                }

                                return `${f.name}: ${primstring} ${tailer}`
                            case "Enum":
                            case "Struct":
                                return `${f.name}: ${type.name} ${tailer}`

                            default: Utilities.assertNever(type)
                        }

                    }).join("\n")}
                }`
    }
}

export async function generateModelsToDirectory(manifest: CompiledTypes.Manifest, dir: string): Promise<void> {
    const models: string[] = []
    manifest.namespace.inScope.forEach(v => {
        if (v.kind === "Function" || v.kind === "StoreDefinition") {
            return
        }
        models.push(modelFor(v))
    })

    child_process.execSync(`mkdir -p ${dir}`)
    fs.writeFileSync(`${dir}/models.ts`, models.join('\n\n'))
}

export const generateModels: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest, buildConf: ConduitBuildConfig}, {modelsGenerated: true}> = {
    stepName: "generateModels",
    func: ({manifest, buildConf}) => {
        const promises = []
        for (const dir in buildConf.dependents) {
            promises.push(generateModelsToDirectory(manifest, dir))
        }
        return Promise.all(promises).then(() => ({modelsGenerated: true}))
    }

}


export const generateAllClients: Utilities.StepDefinition<{modelsGenerated: true, manifest: CompiledTypes.Manifest, buildConf: ConduitBuildConfig, endpoint: string}, {}> = {
    stepName: "generating all clients",
    func: ({manifest, buildConf, endpoint}) => {
        const p = []
        for (const dir in buildConf.dependents) {
            generateClients(endpoint, manifest, dir)
        }
        return Promise.resolve({})
    }
    
}