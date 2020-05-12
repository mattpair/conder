import { Classified } from './util/classifying';
import { SemanticTokenUnion, Meaning } from './Syntax';
import { PrimitiveUnion} from './lexicon';

/**
 * Compaction
 */

 /**
 * Should find a more immutable way to do this as complexity grows
 * TBF, we check that receive all expected fields in syntax validation.
 * We should be able to make assumptions here.
 */
interface MutableMessage {
    fields: Field[]
    name?: string
}

export enum FieldKind {
    PRIMITIVE,
    CUSTOM
}

export type FieldType = Classified<FieldKind.PRIMITIVE, PrimitiveUnion> | Classified<FieldKind.CUSTOM, string>

interface MutableField {
    isRequired: boolean
    name: string
    fType: FieldType
}

interface BaseEnum {
    name: string
    members: EnumMember[]
}

interface BaseEnumMember {
    name: string
    number: number 
}

export type Field = Readonly<MutableField>
export type Enum = Readonly<BaseEnum>

export type EnumMember = Readonly<BaseEnumMember>

export type Message = Readonly<MutableMessage>

function assertNever(x: never): never {
    throw new Error("Unexpected object: " + x);
}

export function collapseTokens(t: SemanticTokenUnion[]): [Message[], Enum[]] {
    const fileContext: [Message[], Enum[]] = [[], []]
    let message: MutableMessage = {fields: []}
    // console.log(`${JSON.stringify(t)}`)
    
    let field: Partial<MutableField> = {isRequired: false}

    let enm: Partial<BaseEnum> = {}
    let enumMember: Partial<BaseEnumMember> = {}

    for (let i = 0; i < t.length; ++i) {
        const semanticToken = t[i]
    
            
        switch(semanticToken.kind) {
            case Meaning.MESSAGE_START:
                message = {fields: []}
                break

            case Meaning.FIELD_TYPE_CUSTOM:
                field.fType = {kind: FieldKind.CUSTOM, val: semanticToken.val}
                break
                
            case Meaning.FIELD_TYPE_PRIMITIVE:                
                field.fType = {kind: FieldKind.PRIMITIVE, val: semanticToken.val}
                break
        
            case Meaning.MESSAGE_NAME:
                message.name = semanticToken.val
                break

            case Meaning.FIELD_NAME: 
                field.name = semanticToken.val
                break
            
            case Meaning.FIELD_END: 
                message.fields.push(field as Field)
                field = {isRequired: false}
                break

            case Meaning.FIELD_REQUIRED:
                field.isRequired = true
                break

            case Meaning.MESSAGE_END: 
                fileContext[0].push(message)
                message = {fields: []}
                break
        
            case Meaning.ENUM_NAME:
                enm = {
                    members: [],
                    name: semanticToken.val
                }
                break
            case Meaning.ENUM_ENTRY_NAME:
                enumMember = {name: semanticToken.val}
                break
            case Meaning.ENUM_ENTRY_NUMBER:
                enumMember.number = semanticToken.val
                break
            case Meaning.ENUM_ENTRY_ENDED:
                enm.members.push(enumMember as EnumMember)
                enumMember = {}
                break
            case Meaning.ENUM_ENDED:
                fileContext[1].push(enm as Enum)
                enm = {}
                break

                
            default: return assertNever(semanticToken)
        }   
    }

    return fileContext
}