
import { Parse} from "./parse";
import { TypeResolved } from "./entity/resolved";
import { resolveDeps } from "./resolveTypes";
import { FileLocation } from "./util/filesystem";
import { Enum, EnumMember } from "./entity/basic";


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

function toProto(files: TypeResolved.ConduitFile[]): Record<string, string> {
    const results: Record<string, string> = {}
    files.filter(f => f.children.Message.length > 0 || f.children.Enum.length > 0).forEach(file => {
        results[`${file.loc.fullname.replace(".cdt", ".proto")}`] = `
syntax="proto2";
        ${file.children.Import.map(d => `import "${d.dep.replace(".cdt", ".proto")}";`).join("\n")}

        ${file.children.Enum.map(printEnum).join("\n\n")}
        ${file.children.Message.map(printMessage).join("\n\n")}
        `
    })

    files.filter(f => f.children.Function.length > 0).forEach(file => {
        console.log("HERE")
        results[`${file.loc.fullname.replace(".cdt", ".function")}`] = `
        ${JSON.stringify(file.children.Function, null, 2)}
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

function printMessage(m: TypeResolved.Message): string {
    const fields = printFields(m.children.Field)

    return `
message ${m.name} {
${fields}
}`
}

function printFields(fields: TypeResolved.Field[]): string {
    return fields
    .map((f, index) => {
        const p = f.part.FieldType.differentiate()
        return `\t${f.isRequired ? 'required' : 'optional'} ${p.kind === "Primitive" ? p.val : p.name} ${f.name} = ${index + 1};`
    })
    .join("\n")
}