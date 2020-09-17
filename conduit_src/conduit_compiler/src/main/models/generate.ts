import { generateClients } from '../clients';
import { CompiledTypes, Utilities } from 'conduit_parser';
import { TypeWriter } from '../type_writing/type_writer';


export function generateAllModels(manifest: CompiledTypes.Manifest): string[] {
    const models: string[] = []
    manifest.inScope.forEach(v => {
        switch(v.kind) {
            case "Enum":
            case "Struct":
                models.push(TypeWriter.typescript.definition(v, manifest.inScope))
        }
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