import { Classified, assertNever } from './util/classifying';
import { SemanticTokenUnion, Meaning } from './Syntax';
import { Unresolved, Resolved } from './entities';

type Dependencies = string[]
export type FileEntities = [Unresolved.Message[], Resolved.Enum[], Dependencies]


export function parseEntities(t: SemanticTokenUnion[]): FileEntities {
    const fileContext: FileEntities = [[], [], []]
    let message: Partial<Unresolved.Message> = {fields: []}
    // console.log(`${JSON.stringify(t)}`)
    
    let field: Partial<Unresolved.Field> = {isRequired: false}

    let enm: Partial<Resolved.Enum> = {}
    let enumMember: Partial<Resolved.EnumMember> = {}

    for (let i = 0; i < t.length; ++i) {
        const semanticToken = t[i]
    
            
        /**
         * TODO: make this not copy objects so much.
         */
        switch(semanticToken.kind) {
            case Meaning.MESSAGE_START:
                message = {fields: []}
                break

            case Meaning.FIELD_TYPE_CUSTOM:
                field = {...field, fType: {kind: Unresolved.FieldKind.CUSTOM, val: semanticToken.val}}
                break
                
            case Meaning.FIELD_TYPE_PRIMITIVE:                
                field = {...field, fType: {kind: Unresolved.FieldKind.PRIMITIVE, val: semanticToken.val}}
                break
        
            case Meaning.MESSAGE_NAME:
                message = {...message, name: semanticToken.val}
                break

            case Meaning.FIELD_NAME: 
                field = {...field, name: semanticToken.val}
                break
            
            case Meaning.FIELD_END: 
                message.fields.push(field as Unresolved.Field)
                field = {isRequired: false}
                break

            case Meaning.FIELD_REQUIRED:
                field = {...field, isRequired: true}
                break

            case Meaning.MESSAGE_END: 
                fileContext[0].push(message as Unresolved.Message)
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

            case Meaning.ENUM_ENTRY_ENDED:
                enm.members.push(enumMember as Resolved.EnumMember)
                enumMember = {}
                break
            case Meaning.ENUM_ENDED:
                fileContext[1].push(enm as Resolved.Enum)
                enm = {}
                break

            case Meaning.IMPORTS:
                fileContext[2].push(semanticToken.val)
                break
                
            default: return assertNever(semanticToken)
        }   
    }

    return fileContext
}

    