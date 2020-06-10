import { FileLocation } from './util/filesystem';
import { PrimitiveUnion } from './lexicon';
import { Classified } from './util/classifying';

export enum TypeKind {
    MESSAGE="MESSAGE",
    ENUM="ENUM",
    PRIMITIVE="PRIMITIVE",
    DEFERRED="DEFERRED",
}

export namespace Resolved {

    export class FileEntities {
        readonly deps: string[] = []
        readonly msgs: Message[] = [] 
        readonly enms: Enum[] = [] 
    }


    export type FieldType = 
    Classified<TypeKind.MESSAGE, () => Message> |
    Classified<TypeKind.ENUM, () => Enum> |
    Classified<TypeKind.PRIMITIVE, PrimitiveUnion> 

    export type Enum = Readonly<{
        members: string[]
        name: string
    }>
    
    export type Field = BaseField<FieldType>

    export type Message = BaseMsg<Field>
    export type ConduitFile = BaseConduitFile<FileEntities>
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

type BaseFunction<STEP_TYPE> = {
    readonly name: string
    readonly steps: STEP_TYPE[]
}

export type BaseConduitFile<ENTITY_TYPE> = {
    readonly loc: FileLocation
    readonly ents: ENTITY_TYPE
}

export namespace Unresolved {

    export class FileEntities {
        readonly msgs: Unresolved.Message[] = [] 
        readonly enms: Resolved.Enum[] = [] 
        readonly imports: Unresolved.Import[] = []
        readonly funcs: Unresolved.Function[] = []
    }
    
    export type ConduitFile = BaseConduitFile<FileEntities>
        
    
    export type Import = { fromPresentDir: boolean, location: string, alias: string}
    export type CustomType = {from?: string, type: string}
    export type FieldType = Classified<TypeKind.PRIMITIVE, PrimitiveUnion> | Classified<TypeKind.DEFERRED, CustomType>
    
    
    export type Field = BaseField<FieldType>
    
    export type Message = BaseMsg<Field>

    export type Function = BaseFunction<string>
}
