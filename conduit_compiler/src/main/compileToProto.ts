
import { Parse, Enum, EnumMember} from "./parseStep1";
import { Resolved } from "./entities";
import { resolveDeps, Return } from "./resolveDependencies";
import { FileLocation } from "./util/filesystem";


export function compileFiles(files: Record<string, () => string>): Record<string, string> {
    const conduits: Parse.File[] = []
    for (const file in files) {
        if (file.endsWith(".cdt")) {
            conduits.push(Parse.extractAllFileEntities(files[file](), new FileLocation(file)))
        }
    }

    const r = resolveDeps(conduits)

    return toProto(r)
} 

function toProto(files: Return[]): Record<string, string> {
    const results: Record<string, string> = {}
    files.filter(f => f.ents.msgs.length > 0 || f.ents.enms.length > 0).forEach(file => {
        results[`${file.loc.fullname.replace(".cdt", ".proto")}`] = `
syntax="proto2";
        ${file.ents.deps.map(d => `import "${d.replace(".cdt", ".proto")}";`).join("\n")}

        ${file.ents.enms.map(printEnum).join("\n\n")}
        ${file.ents.msgs.map(printMessage).join("\n\n")}
        `
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

function printMessage(m: Resolved.Message): string {
    const fields = printFields(m.children.Field)

    return `
message ${m.name} {
${fields}
}`
}

function printFields(fields: Resolved.Field[]): string {
    return fields
    .map((f, index) => `\t${f.isRequired ? 'required' : 'optional'} ${f.fType.kind === "primitive" ? f.fType.val : f.fType.val().name} ${f.name} = ${index + 1};`)
    .join("\n")
}