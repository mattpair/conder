import { PrimitiveUnion } from './lexicon';
import { Classified } from './util/classifying';

export type Named = {
    readonly name: string
}

export namespace Resolved {
    
    export enum TypeKind {
        MESSAGE,
        ENUM,
        PRIMITIVE,
    }

    export type MessageOrEnum = Classified<TypeKind.MESSAGE, Unresolved.Message> |
    Classified<TypeKind.ENUM, Enum>

    export type Type = 
    MessageOrEnum |
    Classified<TypeKind.PRIMITIVE, PrimitiveUnion>

    export type Enum = Readonly<{
        members: EnumMember[]
    } & Named>
    
    export type EnumMember = Readonly<Named>
}



export namespace Unresolved {
    export enum FieldKind {
        PRIMITIVE,
        CUSTOM
    }
    
    export type FieldType = Classified<FieldKind.PRIMITIVE, PrimitiveUnion> | Classified<FieldKind.CUSTOM, {from?: string, type: string}>
    
    
    export type Field = Readonly<{
        isRequired: boolean
        fType: FieldType
    } & Named>
    
    export type Message = Readonly<{
        fields: Field[]
    } & Named>
}
