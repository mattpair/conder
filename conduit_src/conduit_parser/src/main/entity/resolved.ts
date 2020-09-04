import * as basic from './basic'
import { Parse } from '../parse';
import { FileLocation } from '../utils';

export type WithArrayIndicator<T> = Readonly<{isArray: boolean, val: T}>
export type PrimitiveEntity = basic.PrimitiveEntity
export type ResolvedType = Readonly<Parse.CustomTypeEntity | basic.PrimitiveEntity> & {readonly modification: basic.TypeModification}
export type FieldType = basic.BaseFieldType<() => ResolvedType> 
export type TypeModification = basic.TypeModification
    
export type Field = basic.BaseField<FieldType>

export type Struct = basic.BaseStruct<Field> & {readonly file?: FileLocation, readonly isConduitGenerated?: boolean}
export type Enum = basic.Enum & {readonly file: FileLocation}
export type Python3Install = Readonly<{kind: "python3", reldir: string, file: string, name: string}>
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

    getEntityOfType<TYPE extends ENTS["kind"]> (key: string, ...types: TYPE[]): Extract<ENTS, {kind: TYPE}> {
        const got = this.map.get(key)
        if (got === undefined) {
            throw new Error(`Could not find a ${types} named ${key}`)
        }
        //@ts-ignore
        if (types.includes(got.kind))  {
            //@ts-ignore
            return got
        }
        throw new Error(`${key} is a ${got.kind} not a ${types}`)
    }
    
}

export type UnaryParameter = basic.NamedIntrafile<"UnaryParameter", {type: ResolvedType}>
export type Parameter = basic.PolymorphicEntity<"Parameter", () => UnaryParameter | Parse.NoParameter>

export type Variable = Readonly<{
    name: string,
    type: ResolvedType
}>

export type ReturnType = ResolvedType | basic.VoidReturn
export type Statement = Parse.Statement
export type ReturnableStatement = Parse.Returnable
export type FunctionBody = basic.IntrafileEntity<"FunctionBody", {statements: Parse.Statement[]}>
export type Function =  basic.NamedIntrafile<"Function", {
    returnType: ReturnType,
    parameter: Parameter,
    body: FunctionBody,
    method: "POST" | "GET"
}>


export type Entity = Struct | Enum  | HierarchicalStore | Function | Python3Install
export type ScopeMap = EntityMap<Entity>

    

export type Manifest = {
    readonly inScope: ScopeMap
}

export type PrimitiveColumn = Readonly<{
    dif: "prim"
    type: PrimitiveEntity
    columnName: string
    fieldName: string
    modification: TypeModification
}>

export type EnumColumn = Readonly<{
    dif: "enum"
    type: Enum
    columnName: string
    fieldName: string
    modification: Exclude<TypeModification, "optional">
}>

export type StructArrayCol = Readonly<{
    dif: "1:many"
    type: Struct
    fieldName: string
    refTableName: string
    ref: HierarchicalStore
}>

export type StructRefCol = Readonly<{
    dif: "1:1"
    type: Struct
    columnName: string
    fieldName: string
    ref: HierarchicalStore,
    modification: "optional" | "none"
}>

export type CommanderColumn = PrimitiveColumn | StructArrayCol | StructRefCol | EnumColumn

export type HierarchicalStore = Readonly<{
    kind: "HierarchicalStore"
    name: string
    columns: CommanderColumn[]
    typeName: string
    specName: string
}>