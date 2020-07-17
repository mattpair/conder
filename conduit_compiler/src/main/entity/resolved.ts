import * as basic from './basic'
import { Parse } from 'parse';
import { FileLocation } from 'util/filesystem';

// Part of the reason we must use functions for field types is so the types don't circularly reference. Message->FieldType->Message.
export type ResolvedType = Message | Enum | basic.PrimitiveEntity
export type FieldType = basic.BaseFieldType<() => ResolvedType>

    
export type Field = basic.BaseField<FieldType>

export type Message = basic.BaseMsg<Field> & {readonly file: FileLocation}
export type Enum = basic.Enum & {readonly file: FileLocation}
export type Function = (Parse.Function & {readonly file: FileLocation})

export namespace TypeResolved {
    export type TopLevelEntities = Message | Enum | Function
    export type Namespace = {
        readonly name: "default"
        readonly inScope: ReadonlyMap<string, TopLevelEntities>
    }
}


export namespace FunctionResolved {
    type UnaryParameterType = basic.PolymorphicEntity<"UnaryParameterType", () => Message | Enum> 
    type UnaryParameter = basic.BaseUnaryParameter<UnaryParameterType>
    export type Parameter = basic.PolymorphicEntity<"Parameter", () => UnaryParameter | Parse.NoParameter>
    type ReturnStatement = basic.BaseReturnStatement
    type FunctionBody = basic.BaseFunctionBody<basic.BaseStatement<() => ReturnStatement>>
    export type Function = basic.BaseFunction<FunctionBody, basic.BaseReturnTypeSpec<() => Message | Enum | basic.VoidReturn>, Parameter> & {readonly file: FileLocation}

    export type Namespace = {
        readonly name: "default"
        readonly inScope: ReadonlyMap<string, Message | Enum | Function>
    }
    
    export type Manifest = {
        namespaces: Namespace[],
        service: Service
    }

    type ServiceKind = "public"

    type Service = {
        readonly functions: Function[]
        readonly kind: ServiceKind
    }
}
