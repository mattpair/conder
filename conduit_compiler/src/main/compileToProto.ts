import { tokenizePage } from "./tokenizer";
import { Message, collapseTokens, Field, Enum, EnumMember, FieldType } from "./parseStep2";
import { tagTokens } from "./parseStep1";

export default function compile(file: string): string {
    const m: [Message[], Enum[]] = collapseTokens(tagTokens(tokenizePage(file)))
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
    return m.map((e) => `\t${e.name} = ${e.number};`).join("\n")
}

function printMessage(m: Message): string {
    const fields = printFields(m.fields)

    return `
message ${m.name} {
${fields}
}`
}

function printFields(fields: Field[]): string {
    return fields
    .map((f, index) => `\t${f.isRequired ? 'required' : 'optional'} ${f.fType.val} ${f.name} = ${index + 1};`)
    .join("\n")
}