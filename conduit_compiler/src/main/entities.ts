import { PrimitiveUnion } from './lexicon';
import { Classified } from './util/classifying';

export type Named = {
    readonly name: string
}

export namespace Resolved {

    export class FileEntities {
        readonly msgs: Unresolved.Message[] = [] 
        readonly enms: Resolved.Enum[] = [] 
        readonly importTable: EntityLookup = {}
    }

    export type EntityLookup = Record<string, Resolved.MessageOrEnum>

    
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
        members: string[]
    } & Named>
    
}



export namespace Unresolved {
    export enum FieldKind {
        PRIMITIVE,
        CUSTOM
    }

    export class FileEntities {
        readonly msgs: Unresolved.Message[] = [] 
        readonly enms: Resolved.Enum[] = [] 
        readonly imports: Unresolved.Import[] = []
    }
    
    export type Import = {location: string, alias: string}
    export type CustomType = {from?: string, type: string}
    export type FieldType = Classified<FieldKind.PRIMITIVE, PrimitiveUnion> | Classified<FieldKind.CUSTOM, CustomType>
    
    
    export type Field = Readonly<{
        isRequired: boolean
        fType: FieldType
    } & Named>
    
    export type Message = Readonly<{
        fields: Field[]
    } & Named>
}
