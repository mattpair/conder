import { tokenizePage } from "./tokenizer";

import { tagTokens } from "./parseStep1";
import {Unresolved, Enum, EnumMember} from "./parseStep2"

export default function compile(file: string): string {
    const m: [Unresolved.Message[], Enum[]] = Unresolved.collapseTokens(tagTokens(tokenizePage(file)))
    return `
    ${m[1].map(printEnum).join("\n\n")}
    ${m[0].map(printMessage).join("\n\n")}
    `
}

function printEnum(e: Enum): string {
    const mems = printMembers(e.members)
    return `
enum ${e.name} {
${mems}
}
    `
}

function printMembers(m: EnumMember[]): string {
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