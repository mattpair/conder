import { generateClients } from '../clients';
import { CompiledTypes, Utilities } from 'conduit_parser';
import { toTSType } from './toTSType';

function modelFor(ent: CompiledTypes.Struct | CompiledTypes.Enum, inScope: CompiledTypes.ScopeMap): string {
    switch(ent.kind) {
        case "Enum":
            return `
                export enum ${ent.name} {
                    ${ent.children.EnumMember.map((e, i) => `${e.name}=${i}`).join(",\n")}
                }
                `
    
        case "Struct":
            return `
                export type ${ent.name} = {
                    ${ent.children.Field.map(f => {
                        const type = f.part.FieldType.differentiate()
                        return `${f.name}: ${toTSType(type, inScope)}`
    
                    }).join("\n")}
                }`
    }
}

export function generateAllModels(manifest: CompiledTypes.Manifest): string[] {
    const models: string[] = []
    manifest.inScope.forEach(v => {
        if (v.kind === "HierarchicalStore") {
            return
        }
        if (v.kind === "Function") {
            return
        }
        models.push(modelFor(v, manifest.inScope))
    })
    return models
}

export const generateModels: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, {models: string[]}> = {
    stepName: "generateModels",
    func: ({manifest}) => {
        return Promise.resolve({models: generateAllModels(manifest)})
    }

}


export const generateAllClients: Utilities.StepDefinition<{models: string[], manifest: CompiledTypes.Manifest, endpoint: string}, {clients: string}> = {
    stepName: "generating all clients",
    func: ({manifest, models, endpoint}) => {
        
        return Promise.resolve({clients: generateClients(endpoint, manifest, models)})
    }
    
}