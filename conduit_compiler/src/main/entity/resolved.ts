import * as basic from './basic'
import { Parse } from 'parse';
import { FileLocation } from 'util/filesystem';

// Part of the reason we must use functions for field types is so the types don't circularly reference. Message->FieldType->Message.
type ResolvedType = Message | Enum | basic.PrimitiveEntity
export type FieldType = basic.BaseFieldType<() => ResolvedType>

    
export type Field = basic.BaseField<FieldType>

export type Message = basic.BaseMsg<Field>
export type Enum = basic.Enum
export type Import =basic.BaseImport<{dep: string}>

export namespace TypeResolved {

    export type File = 
        basic.Entity<"File"> & 
        basic.ParentOfMany<Parse.Function> &
        basic.ParentOfMany<Import> &
    {
        readonly loc: FileLocation
        readonly inFileScope: Map<string, Message | Enum | File>
    }
}


export namespace FunctionResolved {
    type UnaryParameterType = basic.PolymorphicEntity<"UnaryParameterType", () => (Message | Enum) & {readonly declaredIn: FileLocation}> 
    type UnaryParameter = basic.BaseUnaryParameter<UnaryParameterType>
    export type Parameter = basic.PolymorphicEntity<"Parameter", () => UnaryParameter | Parse.NoParameter>
    type ReturnStatement = basic.BaseReturnStatement
    type FunctionBody = basic.BaseFunctionBody<basic.BaseStatement<() => ReturnStatement>>
    export type Function = basic.BaseFunction<FunctionBody, basic.BaseReturnTypeSpec<() => Message | Enum | basic.VoidReturn>, Parameter>
    export type File = basic.Entity<"File"> & 
    basic.ParentOfMany<Import> &
    {
        readonly loc: FileLocation
        readonly inFileScope: Map<string, Message | Enum | TypeResolved.File>
    }
    
    export type Manifest = {
        files: File[],
        service: Service
    }

    type ServiceKind = "public"

    type Service = {
        readonly functions: Function[]
        readonly kind: ServiceKind
    }
}
