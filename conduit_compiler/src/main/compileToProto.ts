
import { Parse} from "./parse";
import { TypeResolved } from "./entity/resolved";
import { resolveDeps } from "./resolution/resolveTypes";
import { FileLocation } from "./util/filesystem";
import { Enum, EnumMember } from "./entity/basic";
import { validateFunctions } from "./resolution/resolveFunction";


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

function toProto(files: TypeResolved.File[]): Record<string, string> {
    const results: Record<string, string> = {}
    files.filter(f => f.inFileScope.size > 0).forEach(file => {

        const enums: Enum[] = []
        const messages: TypeResolved.Message[] = []
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
        if (enums.length + messages.length === 0) {
            return
        }
        results[`${file.loc.fullname.replace(".cdt", ".proto")}`] = `
syntax="proto2";
        ${file.children.Import.map(d => `import "${d.dep.replace(".cdt", ".proto")}";`).join("\n")}

        ${enums.map(printEnum).join("\n\n")}
        ${messages.map(printMessage).join("\n\n")}
        `
        
    })

    validateFunctions(files)
    files.filter(f => f.children.Function.length > 0).forEach(file => {    
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