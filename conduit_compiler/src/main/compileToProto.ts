
import { tagTokens } from "./parseStep1";
import {parseEntities} from "./parseStep2"
import { Resolved, Unresolved } from "./entities";
import { resolve } from "./resolveDependencies";

export function compileFiles(files: Record<string, () => string>): Record<string, string> {
    const collapsed: Record<string, Unresolved.FileEntities> = {}
    for (const file in files) {
        if (file.endsWith(".cdt")) {
            const entities = parseEntities(tagTokens(files[file]()))
            collapsed[file] = entities 
        }
    }
    resolve(collapsed)

    return toProto(collapsed)
} 

function toProto(files: Record<string, Unresolved.FileEntities>): Record<string, string> {
    const results = {}
    for (const key in files) {
        const m: Unresolved.FileEntities = files[key]
        results[key.replace(".cdt", ".proto")] = `
        ${m.enms.map(printEnum).join("\n\n")}
        ${m.msgs.map(printMessage).join("\n\n")}
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

function printMembers(m: string[]): string {
    return m.map((e, index) => `\t${e} = ${index + 1};`).join("\n")
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
    .map((f, index) => `\t${f.isRequired ? 'required' : 'optional'} ${f.fType.kind === Unresolved.FieldKind.PRIMITIVE ? f.fType.val : f.fType.val.type} ${f.name} = ${index + 1};`)
    .join("\n")
}