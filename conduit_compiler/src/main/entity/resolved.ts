import * as basic from './basic'
import { Parse } from 'parse';
import { FileLocation } from 'util/filesystem';

// Part of the reason we must use functions for field types is so the types don't circularly reference. Message->FieldType->Message.
type ResolvedType = Message | basic.Enum | basic.PrimitiveEntity
export type FieldType = basic.BaseFieldType<() => ResolvedType>

    
export type Field = basic.BaseField<FieldType>

export type Message = basic.BaseMsg<Field>
export type Import =basic.BaseImport<{dep: string}>

export namespace TypeResolved {

    export type File = 
        basic.Entity<"File"> & 
        basic.ParentOfMany<Parse.Function> &
        basic.ParentOfMany<Import> &
    {
        readonly loc: FileLocation
        readonly inFileScope: Map<string, Message | basic.Enum | File>
    }
}


export namespace FunctionResolved {
    type UnaryParameterType = basic.PolymorphicEntity<"UnaryParameterType", () => Message | basic.Enum >
    type UnaryParameter = basic.BaseUnaryParameter<UnaryParameterType>
    export type Parameter = basic.PolymorphicEntity<"Parameter", () => UnaryParameter | Parse.NoParameter>
    type ReturnStatement = basic.BaseReturnStatement
    type FunctionBody = basic.BaseFunctionBody<basic.BaseStatement<() => ReturnStatement>>
    export type Function = basic.BaseFunction<FunctionBody, basic.BaseReturnTypeSpec<() => Message | basic.Enum | basic.VoidReturn>, Parameter>
    export type File = basic.Entity<"File"> & 
    basic.ParentOfMany<Function> &
    basic.ParentOfMany<Import> &
    {
        readonly loc: FileLocation
        readonly inFileScope: Map<string, Message | basic.Enum | TypeResolved.File>
    }
        
}
