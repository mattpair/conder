import { LabeledToken } from './parseStep1';
import { assertNever } from './util/classifying';
import { Meaning } from './Syntax';
import { Unresolved, TypeKind } from './entities';


type LastTopLevelEntity = "enum" | "msg"

export function parseEntities(t: LabeledToken[]): Unresolved.FileEntities {
    const fileContext = new Unresolved.FileEntities()
    let lastEnt: LastTopLevelEntity | undefined = undefined
    let message: Unresolved.Message
    let field: Partial<Unresolved.Field> = {isRequired: true}
    
    for (let i = 0; i < t.length; ++i) {
        const semanticToken = t[i].meaning
                
        switch(semanticToken.kind) {

            case Meaning.FIELD_TYPE_CUSTOM:
                field = {...field, fType: {kind: TypeKind.DEFERRED, val: semanticToken.val}}
                break
                
            case Meaning.FIELD_TYPE_PRIMITIVE:                
                field = {...field, fType: {kind: TypeKind.PRIMITIVE, val: semanticToken.val}}
                break
        
            case Meaning.MESSAGE_DECLARATION:
                lastEnt = "msg"
                message = {
                    name: semanticToken.val,
                    fields: []
                }
    
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

            case Meaning.ENTITY_END: 
                if (lastEnt === "msg") {
                    fileContext.msgs.push(message as Unresolved.Message)
                    message = undefined
                }
                // Enums are put onto the file context immediately.
                
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
            
            case Meaning.FUNCTION_DECLARATION:
                fileContext.funcs.push({name: semanticToken.val, steps: []})

                break
            default: return assertNever(semanticToken)
        }   
    }

    return fileContext
}

    