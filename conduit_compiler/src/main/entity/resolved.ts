import * as basic from './basic'
import { Parse } from '../parse';
import { FileLocation } from '../util/filesystem';

// Part of the reason we must use functions for field types is so the types don't circularly reference. Message->FieldType->Message.

export type WithArrayIndicator<T> = Readonly<{isArray: boolean, val: T}>
export type ResolvedType = Struct | Enum | basic.PrimitiveEntity
export type FieldType = basic.BaseFieldType<() => ResolvedType>

    
export type Field = basic.BaseField<FieldType>

export type Struct = basic.BaseStruct<Field> & {readonly file: FileLocation}
export type Enum = basic.Enum & {readonly file: FileLocation}
export type Function = (Parse.Function & {readonly file: FileLocation})
export type Store = basic.NamedIntrafile<"StoreDefinition", {readonly stores: Struct}>


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

    getEntityOfType<TYPE extends ENTS["kind"]> (key: string, type: TYPE): Extract<ENTS, {kind: TYPE}> {
        const got = this.map.get(key)
        if (got === undefined) {
            throw new Error(`Could not find a ${type} named ${key}`)
        }
        if (got.kind === type)  {
            //@ts-ignore
            return got
        }
        throw new Error(`${key} is a ${got.kind} not a ${type}`)
    }
    
}

export namespace TypeResolved {
    export type TopLevelEntities = Struct | Enum | Function | Store
    export type Namespace = {
        readonly name: "default"
        readonly inScope: EntityMap<TopLevelEntities>
    }
}


export namespace FunctionResolved {
    export type UnaryParameter = basic.NamedIntrafile<"UnaryParameter", {type: RealType}>
    export type Parameter = basic.PolymorphicEntity<"Parameter", () => UnaryParameter | Parse.NoParameter>

    export type Variable = Readonly<{
        name: string,
        type: WithArrayIndicator<Struct>
    }>

    type BaseStatement<KIND extends basic.IntrafileEntityKinds, DATA, RETURN extends Type> = 
        basic.IntrafileEntity<KIND, DATA> & {readonly returnType: RETURN}
    export type Append = BaseStatement<"Append", {inserting: Variable, into: Store}, basic.VoidReturn>
    export type StoreReference = BaseStatement<"StoreReference", {from: Store}, RealType>
    export type VariableReference = BaseStatement<"VariableReference", Variable, RealType> 
    export type Statement = Append | StoreReference | VariableReference | basic.ReturnStatement | StoreReference
    export type FunctionBody = basic.IntrafileEntity<"FunctionBody", {statements: Statement[]}>

    export type RealType = {kind: "real type" } & WithArrayIndicator<Struct>
    export type Type = RealType | basic.VoidReturn
    export type Function =  basic.NamedIntrafile<"Function", {
        requiresDbClient: boolean,
        returnType: Type,
        parameter: Parameter,
        body: FunctionBody,
        method: "POST" | "GET"
    }>
    

    export type Namespace = {
        readonly name: "default"
        readonly inScope: EntityMap<Struct | Enum | Function | Store>
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
