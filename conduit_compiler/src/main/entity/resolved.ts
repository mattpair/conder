import * as basic from './basic'
import { Parse } from '../parse';
import { FileLocation } from '../util/filesystem';

// Part of the reason we must use functions for field types is so the types don't circularly reference. Message->FieldType->Message.
export type ResolvedType = Message | Enum | basic.PrimitiveEntity
export type FieldType = basic.BaseFieldType<() => ResolvedType>

    
export type Field = basic.BaseField<FieldType>

export type Message = basic.BaseMsg<Field> & {readonly file: FileLocation}
export type Enum = basic.Enum & {readonly file: FileLocation}
export type Function = (Parse.Function & {readonly file: FileLocation})


export class EntityMap<ENTS extends {kind: basic.EntityKinds}> {
    private readonly map: Map<string, ENTS>
    readonly size: number;

    constructor(m: Map<string, ENTS>) {
        this.map = m
        this.size = m.size
    }

    forEach(callbackfn: (value: ENTS, key: string, map: ReadonlyMap<string, ENTS>) => void, thisArg?: any): void {
        this.map.forEach(callbackfn)
    }

    get(key: string): ENTS | undefined {
        return this.map.get(key)
    }
    has(key: string): boolean {
        return this.map.has(key)
    }

    getEntityOfType<TYPE extends ENTS["kind"]> (key: string, type: TYPE): Extract<ENTS, {kind: TYPE}> | undefined {
        const got = this.map.get(key)
        if (got === undefined || got.kind === type)  {
            //@ts-ignore
            return got
        }
        throw new Error(`${key} is a ${got.kind} not a ${type}`)
    }
    
}

export namespace TypeResolved {
    export type TopLevelEntities = Message | Enum | Function
    export type Namespace = {
        readonly name: "default"
        readonly inScope: EntityMap<TopLevelEntities>
    }
}


export namespace FunctionResolved {
    type UnaryParameterType = basic.PolymorphicEntity<"UnaryParameterType", () => Message > 
    export type UnaryParameter = basic.BaseUnaryParameter<UnaryParameterType>
    export type Parameter = basic.PolymorphicEntity<"Parameter", () => UnaryParameter | Parse.NoParameter>
    type ReturnStatement = basic.BaseReturnStatement
    type FunctionBody = basic.BaseFunctionBody<basic.BaseStatement<() => ReturnStatement>>
    export type Function = basic.BaseFunction<FunctionBody, basic.BaseReturnTypeSpec<() => Message | basic.VoidReturn>, Parameter> & {readonly file: FileLocation}

    export type Namespace = {
        readonly name: "default"
        readonly inScope: EntityMap<Message | Enum | Function>
    }
    
    export type Manifest = {
        namespace: Namespace,
        service: Service
    }

    type ServiceKind = "public"

    type Service = {
        readonly functions: Function[]
        readonly kind: ServiceKind
    }
}
