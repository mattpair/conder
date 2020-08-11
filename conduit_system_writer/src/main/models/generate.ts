import { generateClients } from '../clients';
import { Lexicon, CompiledTypes, Utilities } from 'conduit_compiler';

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
                        let prefix = ''
                        let suffix = ""
                        switch (f.part.FieldType.modification) {
                            case "optional":
                                suffix = "| null"
                                break;
                            case  "array":
                                prefix = "Array<"
                                suffix = ">"
                        }
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

                                return `${f.name}: ${prefix}${primstring}${suffix}`
                            case "custom":
                                const ent = inScope.getEntityOfType(type.name, "Struct", "Enum")
                                return `${f.name}: ${prefix}${ent.name}${suffix}`

                            default: Utilities.assertNever(type)
                        }

                    }).join("\n")}
                }`
    }
}

export function generateAllModels(manifest: CompiledTypes.Manifest): string[] {
    const models: string[] = []
    manifest.inScope.forEach(v => {
        if (v.kind === "Function" || v.kind === "StoreDefinition") {
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