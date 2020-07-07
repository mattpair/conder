
import { Parse} from "./parse";
import { FunctionResolved, TypeResolved, Message, Field } from "./entity/resolved";
import { resolveDeps } from "./resolution/resolveTypes";
import { FileLocation } from "./util/filesystem";
import { Enum, EnumMember } from "./entity/basic";
import { resolveFunctions } from "./resolution/resolveFunction";

export type PartiallyCompiled = Record<string, {proto: string, data: FunctionResolved.File}>
export function compileFiles(files: Record<string, () => string>): PartiallyCompiled {
    const conduits: Parse.File[] = []
    for (const file in files) {
        if (file.endsWith(".cdt")) {
            conduits.push(Parse.extractAllFileEntities(files[file](), new FileLocation(file)))
        }
    }

    const r = resolveDeps(conduits)

    return resolveFunctionsAndProto(r)
} 

function resolveFunctionsAndProto(files: TypeResolved.File[]): PartiallyCompiled {
    const results: PartiallyCompiled = {}
    files.forEach(file => {

        const enums: Enum[] = []
        const messages: Message[] = []
        file.inFileScope.forEach(v => {
            switch(v.kind) {
                case "Enum":
                    enums.push(v)
                    break;
                case "Message":
                    messages.push(v)
                    break;
            }
        })
        let proto = ''
        if (enums.length + messages.length > 0) {
            proto = `
syntax="proto2";
${file.children.Import.map(d => `import "${d.dep.replace(".cdt", ".proto")}";`).join("\n")}
            
${enums.map(printEnum).join("\n\n")}
${messages.map(printMessage).join("\n\n")}
`
        }

        results[`${file.loc.fullname.replace(".cdt", ".proto")}`] = {proto, data: resolveFunctions(file)}
        
    })

    return results       
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