import { Classified, assertNever } from './util/classifying';
import { SemanticTokenUnion, Meaning } from './Syntax';
import { Unresolved, Resolved } from './entities';

export class FileEntities {
    readonly msgs: Unresolved.Message[] = [] 
    readonly enms: Resolved.Enum[] = [] 
    readonly imports: Unresolved.Import[] = []
}


export function parseEntities(t: SemanticTokenUnion[]): FileEntities {
    const fileContext = new FileEntities()
    let message: Partial<Unresolved.Message> = {fields: []}
    // console.log(t)
    
    let field: Partial<Unresolved.Field> = {isRequired: true}

    for (let i = 0; i < t.length; ++i) {
        const semanticToken = t[i]
                
        /**
         * TODO: make this not copy objects so much.
         */
        switch(semanticToken.kind) {

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
                field = {isRequired: true}
                break

            case Meaning.FIELD_OPTIONAL:
                field = {...field, isRequired: false}
                break

            case Meaning.MESSAGE_END: 
                fileContext.msgs.push(message as Unresolved.Message)
                message = {fields: []}
                break
        
            case Meaning.ENUM_DECLARATION:
                fileContext.enms.push(semanticToken.val)
                break
            case Meaning.ENUM_MEMBER:
                fileContext.enms[fileContext.enms.length - 1].members.push(semanticToken.val)
                break

            case Meaning.IMPORT:
                fileContext.imports.push(semanticToken.val)
                break
            

            default: return assertNever(semanticToken)
        }   
    }

    return fileContext
}

    