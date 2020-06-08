
import { tagTokens } from "./parseStep1";
import {parseEntities} from "./parseStep2"
import { Resolved, Unresolved, TypeKind } from "./entities";
import { resolveDeps } from "./resolveDependencies";
import { FileLocation } from "./util/filesystem";

export function compileFiles(files: Record<string, () => string>): Record<string, string> {
    const conduits: Unresolved.ConduitFile[] = []
    for (const file in files) {
        if (file.endsWith(".cdt")) {
            const ents = parseEntities(tagTokens(files[file]()))
            conduits.push({
                loc: new FileLocation(file),
                ents
            })
        }
    }

    const r = resolveDeps(conduits)
    // for (const f in r) {
    //     r[f].msgs.forEach(m => {
    //         // console.log(m.name, m.fields.map(field => field.fType.kind !== TypeKind.PRIMITIVE ? field.fType.val() : ""))
    //     })
    // }

    return toProto(r)
} 

function toProto(files: Resolved.ConduitFile[]): Record<string, string> {
    const results: Record<string, string> = {}
    files.forEach(file => {
        results[`${file.loc.fullname.replace(".cdt", ".proto")}`] = `
syntax="proto2";
        ${file.ents.deps.map(d => `import "${d.replace(".cdt", ".proto")}";`).join("\n")}

        ${file.ents.enms.map(printEnum).join("\n\n")}
        ${file.ents.msgs.map(printMessage).join("\n\n")}
        `
    })

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

function printMessage(m: Resolved.Message): string {
    const fields = printFields(m.fields)

    return `
message ${m.name} {
${fields}
}`
}

function printFields(fields: Resolved.Field[]): string {
    return fields
    .map((f, index) => `\t${f.isRequired ? 'required' : 'optional'} ${f.fType.kind === TypeKind.PRIMITIVE ? f.fType.val : f.fType.val().name} ${f.name} = ${index + 1};`)
    .join("\n")
}