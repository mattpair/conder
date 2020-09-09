import { CompiledTypes, Lexicon, Utilities, Parse } from "conduit_parser"
import { extractRefStructName } from "./extractRefStructName"

type SupportedTypeWritingLanguages = "typescript" | "rust"
type TypeWriter = (ent: CompiledTypes.Struct | CompiledTypes.Enum, inScope: CompiledTypes.ScopeMap) => string
type RefWriter = (type: CompiledTypes.Type, inScope: CompiledTypes.ScopeMap) => string

type PrimitiveWriter = Record<Lexicon.PrimitiveUnion, string>
type CompleteTypeWriter = {
    [T in SupportedTypeWritingLanguages]: {
        definition: TypeWriter
        reference: RefWriter
        primitive: PrimitiveWriter
    }
}

export const TypeWriter: CompleteTypeWriter = {
    typescript: {
        primitive: {
            double: "number",
            int32: "number",
            int64: "number",
            float: "number",
            uint32: "number",
            uint64: "number",
            bool: "boolean",
            string: "string",
            bytes: "Uint8Array"
        },
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
                                const type = f.part.CompleteType.differentiate()
                                return `${f.name}: ${TypeWriter.typescript.reference(type, inScope)}`
        
                            }).join("\n")}
                        }`
            }   
        },
        reference: (type, inScope) => {
            let prefix = '';
            let suffix = "";
            let focus_type = type
            if (type.kind === "DetailedType") {
                switch (type.modification) {
                    case Lexicon.Symbol.Array:
                        prefix = "Array<";
                        suffix = ">";
                        break;
            
                    case Lexicon.Symbol.Optional:
                        suffix = "| null";
                    case Lexicon.Symbol.none:
                        break;
                    case Lexicon.Symbol.Ref: 
                        return extractRefStructName(type, inScope)
                    
                    default: Utilities.assertNever(type.modification);
                }
                focus_type = type.part.CompleteType.differentiate()
            }
            
            switch (focus_type.kind) {
                case "DetailedType":
                    throw Error(`Unexpected generic use`)

                case "Primitive":
                    const primstring = TypeWriter.typescript.primitive[focus_type.type]
        
                    return `${prefix}${primstring}${suffix}`;
                case "TypeName":
                    const ent = inScope.getEntityOfType(focus_type.name, "Struct", "Enum");
                    return `${prefix}${ent.name}${suffix}`;
        
                default: Utilities.assertNever(focus_type);
            }
        }
    },
    rust: {
        primitive: {
            double: "f64",
            int32: "i32",
            int64: "i64",
            float: "f32",
            uint32: "i32",
            uint64: "i64",
            bool: "bool",
            string: "String",
            bytes: "Vec<u8>"
        },
        definition: (val, inScope) => {
            if (val.kind === "Enum") {
                return ''
            }
            const fields: string[] = val.children.Field.map((field: Parse.Field) => {
                const field_type = field.part.CompleteType.differentiate()
                return `${field.name}: ${TypeWriter.rust.reference(field_type, inScope)}`
            })
        
            const makeStruct = (prefix: string, strFields: string[]) =>  `
            #[derive(Serialize, Deserialize, Clone)]
            struct ${prefix}${val.name}${strFields.length > 0 ? ` {
                ${strFields.join(",\n")}
            }` : `;`}
            `
            if (!val.isConduitGenerated) {
                fields.push(`#[serde(skip)]\nconduit_entity_id: Option<i32>`)
            }
            return makeStruct('', fields)
        },

        reference: (r, inScope) => {
            let base = '';
            let prefix = '';
            let suffix = '';
            let focus_type = r
            if (r.kind === "DetailedType") {
                switch (r.modification) {
                    case Lexicon.Symbol.Array:
                        prefix = 'Vec<';
                        suffix = '>';
                        break;
            
                    case Lexicon.Symbol.Optional:
                        prefix = 'Option<';
                        suffix = '>';
                    case Lexicon.Symbol.none:
                        break;
                    case Lexicon.Symbol.Ref:
                        return extractRefStructName(r, inScope)
                        
                    default: Utilities.assertNever(r.modification);
                }
                focus_type = r.part.CompleteType.differentiate()
            }
            switch (focus_type.kind) {
                case "DetailedType":
                    throw Error(`Unexpected Generic`)
                case "Primitive":
                    base = TypeWriter.rust.primitive[focus_type.type];
                    break;
        
                case "TypeName":
                    const ent = inScope.getEntityOfType(focus_type.name, "Enum", "Struct");
                    switch (ent.kind) {
                        case "Struct":
                            base = focus_type.name;
                            break;
        
                        case "Enum":
                            base = 'i64';
                            break;
                    }
                    break;
        
                default: Utilities.assertNever(focus_type);
            }
            

            return `${prefix}${base}${suffix}`;
        }
    }
}
