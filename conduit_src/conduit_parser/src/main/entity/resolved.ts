
import { SchemaInstance, AnySchemaInstance } from './../SchemaFactory';
import * as basic from './basic'
import { Parse } from '../parse';
import { FileLocation } from '../utils';

export type WithArrayIndicator<T> = Readonly<{isArray: boolean, val: T}>

export type Struct = Readonly<{
    file?: FileLocation, 
    isConduitGenerated?: boolean
    name: string  
    schema: SchemaInstance<"Object">,
    kind: "Struct"
}>
export type Enum = basic.Enum
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
export type Type = ReturnType<Parse.CompleteType["differentiate"]>

export type Variable = Readonly<{
    name: string,
    type: Parse.CompleteType
}>
export type Primitive = basic.PrimitiveEntity

export type RetType = AnySchemaInstance | basic.VoidReturn
export type Statement = Parse.Statement
export type ReturnableStatement = Parse.Returnable
export type Function =  basic.NamedIntrafile<"Function", {
    returnType: RetType,
    parameter: Parse.NoParameter | {name: string, schema: AnySchemaInstance},
    body: Parse.Statement[],
    method: "POST" | "GET"
}>


export type Entity = Struct | Enum  | HierarchicalStore | Function | Python3Install
export type ScopeMap = EntityMap<Entity>

    

export type Manifest = {
    readonly inScope: ScopeMap
}


export type HierarchicalStore = Readonly<{
    kind: "HierarchicalStore"
    name: string
    schema: SchemaInstance<"Object">
    typeName: string
    specName: string
}>