import { CompiledTypes } from "conduit_parser"
import { toTSType } from "../models/toTSType"
import { resolvedToRustType } from "../resolvedToRustType"

type SupportedTypeWritingLanguages = "typescript" | "rust"
type TypeWriter = (ent: CompiledTypes.Struct | CompiledTypes.Enum, inScope: CompiledTypes.ScopeMap) => string

type CompleteTypeWriter = {
    [T in SupportedTypeWritingLanguages]: TypeWriter
}

export const TypeWriter: CompleteTypeWriter = {
    typescript: (ent, inScope) => {
        switch(ent.kind) {
            case "Enum":
                return `
                    export enum ${ent.name} {
                        ${ent.children.EnumMember.map((e, i) => `${e.name}=${i}`).join(",\n")}
                    }
                    `
        
            case "Struct":
                return `
                    export type ${ent.name} = {
                        ${ent.children.Field.map(f => {
                            const type = f.part.FieldType.differentiate()
                            return `${f.name}: ${toTSType(type, inScope)}`
        
                        }).join("\n")}
                    }`
        }
    },
    rust: (val, inScope) => {
        if (val.kind === "Enum") {
            return ''
        }
        const fields: string[] = val.children.Field.map((field: CompiledTypes.Field) => {
            const field_type = field.part.FieldType.differentiate()
            return `${field.name}: ${resolvedToRustType(field_type, inScope)}`
        })
    
        const makeStruct = (prefix: string, strFields: string[]) =>  `
        #[derive(Serialize, Deserialize, Clone)]
        struct ${prefix}${val.name}${strFields.length > 0 ? ` {
            ${strFields.join(",\n")}
        }` : `;`}
        `
        if (!val.isConduitGenerated) {
            fields.push(`conduit_entity_id: Option<i32>`)
        }
        return makeStruct('', fields)
    }
}
