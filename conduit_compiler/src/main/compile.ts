
import { Parse} from "./parse";
import { FunctionResolved, TypeResolved, Message, Field } from "./entity/resolved";
import { toNamespace } from "./resolution/resolveTypes";
import { FileLocation } from "./util/filesystem";
import { Enum, EnumMember } from "./entity/basic";
import { resolveFunctions } from "./resolution/resolveFunction";

export function compileFiles(files: Record<string, () => string>): [{proto: string}, FunctionResolved.Manifest] {
    const conduits: Parse.File[] = []
    for (const file in files) {
        if (file.endsWith(".cdt")) {
            conduits.push(Parse.extractAllFileEntities(files[file](), new FileLocation(file)))
        }
    }

    const r = toNamespace(conduits)

    return [toProto(r),resolveFunctions(r)]
} 

function toProto(namespace: TypeResolved.Namespace): {proto: string} {
    const enums: Enum[] = []
    const messages: Message[] = []

    namespace.inScope.forEach((val, key) => {
        switch(val.kind) {
            case "Enum":
                enums.push(val)
                break
            case "Message":
                messages.push(val)

        }
    })

    let proto = ''
    if (enums.length + messages.length > 0) {
        proto = `
syntax="proto2";
            
${enums.map(printEnum).join("\n\n")}
${messages.map(printMessage).join("\n\n")}
`
    }

    return {proto}
}

function printEnum(e: Enum): string {
    const mems = printMembers(e.children.EnumMember)
    return `
enum ${e.name} {
${mems}
}
    `
}

function printMembers(m: EnumMember[]): string {
    return m.map((e, index) => `\t${e.name} = ${index + 1};`).join("\n")
}

function printMessage(m: Message): string {
    const fields = printFields(m.children.Field)

    return `
message ${m.name} {
${fields}
}`
}

function printFields(fields: Field[]): string {
    return fields
    .map((f, index) => {
        const p = f.part.FieldType.differentiate()
        return `\t${f.isRequired ? 'required' : 'optional'} ${p.kind === "Primitive" ? p.val : p.name} ${f.name} = ${index + 1};`
    })
    .join("\n")
}