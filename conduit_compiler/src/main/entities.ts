import { PrimitiveUnion } from './lexicon';
import { Classified } from './util/classifying';

export type Named = {
    readonly name: string
}

export enum TypeKind {
    MESSAGE,
    ENUM,
    PRIMITIVE,
    DEFERRED,
}

export namespace PartialResolved {

    
    export type FieldType = Resolved.FieldType |  
    Classified<TypeKind.DEFERRED, Unresolved.CustomType>

    export type Message = BaseMsg<BaseField<FieldType>>
}

export namespace Resolved {

    export class FileEntities {
        readonly msgs: Message[] = [] 
        readonly enms: Enum[] = [] 
    }
    

    export type FieldType = 
    Classified<TypeKind.MESSAGE, Message> |
    Classified<TypeKind.ENUM, Enum> |
    Classified<TypeKind.PRIMITIVE, PrimitiveUnion> 

    export type Enum = Readonly<{
        members: string[]
    } & Named>
    
    export type Field = BaseField<FieldType>

    export type Message = BaseMsg<Field>
}

export type BaseField<TYPE> = {
    readonly isRequired: boolean
    readonly fType: TYPE
    readonly name: string
}

export type BaseMsg<FIELD_TYPE> = {
    readonly name: string
    readonly fields: FIELD_TYPE[]
}


export namespace Unresolved {

    export class FileEntities {
        readonly msgs: Unresolved.Message[] = [] 
        readonly enms: Resolved.Enum[] = [] 
        readonly imports: Unresolved.Import[] = []
    }
    
    export type Import = {location: string, alias: string}
    export type CustomType = {from?: string, type: string}
    export type FieldType = Classified<TypeKind.PRIMITIVE, PrimitiveUnion> | Classified<TypeKind.DEFERRED, CustomType>
    
    
    export type Field = BaseField<FieldType>
    
    export type Message = BaseMsg<Field>
}
