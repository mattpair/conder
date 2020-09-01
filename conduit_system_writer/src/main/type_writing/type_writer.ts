import { CompiledTypes, Lexicon, Utilities } from "conduit_parser"
import { primitiveToRustType } from "../primitiveToRustType"

type SupportedTypeWritingLanguages = "typescript" | "rust"
type TypeWriter = (ent: CompiledTypes.Struct | CompiledTypes.Enum, inScope: CompiledTypes.ScopeMap) => string
type RefWriter = (type: CompiledTypes.ResolvedType, inScope: CompiledTypes.ScopeMap) => string
type CompleteTypeWriter = {
    [T in SupportedTypeWritingLanguages]: {
        definition: TypeWriter
        reference: RefWriter
    }
}

export const TypeWriter: CompleteTypeWriter = {
    typescript: {
        definition: (ent, inScope) => {
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
                                return `${f.name}: ${TypeWriter.typescript.reference(type, inScope)}`
        
                            }).join("\n")}
                        }`
            }   
        },
        reference: (type, inScope) => {
            let prefix = '';
            let suffix = "";
            switch (type.modification) {
                case "array":
                    prefix = "Array<";
                    suffix = ">";
                    break;
        
                case "optional":
                    suffix = "| null";
                case "none":
                    break;
                default: Utilities.assertNever(type.modification);
            }
            switch (type.kind) {
                case "Primitive":
                    let primstring = '';
                    switch (type.val) {
                        case Lexicon.Symbol.bool:
                            primstring = 'boolean';
                            break;
                        case Lexicon.Symbol.bytes:
                            throw Error("bytes not yet supported");
                        case Lexicon.Symbol.double:
                        case Lexicon.Symbol.float:
                        case Lexicon.Symbol.int32:
                        case Lexicon.Symbol.int64:
                        case Lexicon.Symbol.uint32:
                        case Lexicon.Symbol.uint64:
                            primstring = 'number';
                            break;
                        case Lexicon.Symbol.string:
                            primstring = 'string';
                            break;
        
                        default: Utilities.assertNever(type.val);
                    }
        
                    return `${prefix}${primstring}${suffix}`;
                case "CustomType":
                    const ent = inScope.getEntityOfType(type.type, "Struct", "Enum");
                    return `${prefix}${ent.name}${suffix}`;
        
                default: Utilities.assertNever(type);
            }
        }
    },
    rust: {
        definition: (val, inScope) => {
            if (val.kind === "Enum") {
                return ''
            }
            const fields: string[] = val.children.Field.map((field: CompiledTypes.Field) => {
                const field_type = field.part.FieldType.differentiate()
                return `${field.name}: ${TypeWriter.rust.reference(field_type, inScope)}`
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
        },

        reference: (r, inScope) => {
            let base = '';
            switch (r.kind) {
                case "Primitive":
                    base = primitiveToRustType(r.val);
                    break;
        
                case "CustomType":
                    const ent = inScope.getEntityOfType(r.type, "Enum", "Struct");
                    switch (ent.kind) {
                        case "Struct":
                            base = r.type;
                            break;
        
                        case "Enum":
                            base = 'i64';
                            break;
                    }
                    break;
        
                default: Utilities.assertNever(r);
            }
            let prefix = '';
            let suffix = '';
            switch (r.modification) {
                case "array":
                    prefix = 'Vec<';
                    suffix = '>';
                case "none":
                    break;
        
                case "optional":
                    prefix = 'Option<';
                    suffix = '>';
                    break;
        
                default: Utilities.assertNever(r.modification);
            }
            return `${prefix}${base}${suffix}`;
        }
    }
}
