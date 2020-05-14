import { tokenizePage } from "./tokenizer";

import { tagTokens } from "./parseStep1";
import {parseEntities, FileEntities} from "./parseStep2"
import { Resolved, Unresolved } from "./entities";
import { resolve } from "./resolveDependencies";

export function compileFiles(files: Record<string, () => string>): Record<string, string> {
    const collapsed: Record<string, FileEntities> = {}
    for (const file in files) {
        if (file.endsWith(".cdt")) {
            const entities = parseEntities(tagTokens(tokenizePage(files[file]())))
            collapsed[file] = entities 
            resolve(entities[0], entities[1])
        }
    }

    return toProto(collapsed)
} 

function toProto(files: Record<string, FileEntities>): Record<string, string> {
    const results = {}
    for (const key in files) {
        const m = files[key]
        results[key.replace(".cdt", ".proto")] = `
        ${m[1].map(printEnum).join("\n\n")}
        ${m[0].map(printMessage).join("\n\n")}
        `
    }
    return results
}

function printEnum(e: Resolved.Enum): string {
    const mems = printMembers(e.members)
    return `
enum ${e.name} {
${mems}
}
    `
}

function printMembers(m: Resolved.EnumMember[]): string {
    return m.map((e, index) => `\t${e.name} = ${index + 1};`).join("\n")
}

function printMessage(m: Unresolved.Message): string {
    const fields = printFields(m.fields)

    return `
message ${m.name} {
${fields}
}`
}

function printFields(fields: Unresolved.Field[]): string {
    return fields
    .map((f, index) => `\t${f.isRequired ? 'required' : 'optional'} ${f.fType.val} ${f.name} = ${index + 1};`)
    .join("\n")
}