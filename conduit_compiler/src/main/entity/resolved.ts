import * as basic from './basic'
import { Parse } from '../parse';
import { FileLocation } from '../utils';

export type WithArrayIndicator<T> = Readonly<{isArray: boolean, val: T}>
export type PrimitiveEntity = basic.PrimitiveEntity
export type ResolvedType = Readonly<{kind: "custom", name: string} | basic.PrimitiveEntity>
export type FieldType = basic.BaseFieldType<() => ResolvedType> & {readonly modification: basic.TypeModification}
export type TypeModification = basic.TypeModification
    
export type Field = basic.BaseField<FieldType>

export type Struct = basic.BaseStruct<Field> & {readonly file: FileLocation}
export type Enum = basic.Enum & {readonly file: FileLocation}

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

export type UnaryParameter = basic.NamedIntrafile<"UnaryParameter", {type: RealType}>
export type Parameter = basic.PolymorphicEntity<"Parameter", () => UnaryParameter | Parse.NoParameter>

export type Variable = Readonly<{
    name: string,
    type: WithArrayIndicator<Struct>
}>

type BaseStatement<KIND extends basic.IntrafileEntityKinds, DATA, RETURN extends ReturnType> = 
    basic.IntrafileEntity<KIND, DATA> & {readonly returnType: RETURN}
export type Append = BaseStatement<"Append", {inserting: Variable, into: HierarchicalStore}, basic.VoidReturn>
export type StoreReference = BaseStatement<"StoreReference", {from: HierarchicalStore}, RealType>
export type VariableReference = BaseStatement<"VariableReference", Variable, RealType> 
export type Statement = Append | StoreReference | VariableReference | basic.ReturnStatement | StoreReference
export type FunctionBody = basic.IntrafileEntity<"FunctionBody", {statements: Statement[]}>

export type RealType = {kind: "real type" } & WithArrayIndicator<Struct>
export type ReturnType = RealType | basic.VoidReturn
export type Function =  basic.NamedIntrafile<"Function", {
    requiresDbClient: boolean,
    returnType: ReturnType,
    parameter: Parameter,
    body: FunctionBody,
    method: "POST" | "GET"
}>



export type ScopeMap = EntityMap<Struct | Enum | Function | HierarchicalStore>
    

export type Manifest = {
    readonly inScope: ScopeMap
}

export type PrimitiveColumn = {
    dif: "prim"
    type: PrimitiveEntity
    columnName: string
    fieldName: string
    modification: TypeModification
}

export type EnumColumn = {
    dif: "enum"
    type: Enum
    columnName: string
    fieldName: string
    modification: Exclude<TypeModification, "optional">
}

export type StructArrayCol = {
    dif: "1:many"
    type: Struct
    fieldName: string
    refTableName: string
    ref: HierarchicalStore
}

export type StructRefCol = {
    dif: "1:1"
    type: Struct
    columnName: string
    fieldName: string
    ref: HierarchicalStore,
    modification: "optional" | "none"
}

export type CommanderColumn = PrimitiveColumn | StructArrayCol | StructRefCol | EnumColumn

export type HierarchicalStore = Readonly<{
    kind: "HierarchicalStore"
    name: string
    columns: CommanderColumn[]
    typeName: string
    specName: string
}>