import { FileLocation } from "../util/filesystem"

export enum EntityKind {
    EnumMember="EnumMember",
    Enum="Enum",
    Message="Message",
    Field="Field",
    Import="Import",
    File="File",
}

export type EntityLocation = {
    readonly startLineNumber: number
    readonly endLineNumber: number
    readonly startColNumber: number
    readonly endColNumber: number
}

type Entity<KIND extends EntityKind> = {readonly kind: KIND}

export type BaseField<TYPE> = NamedIntrafile<EntityKind.Field, {
    readonly isRequired: boolean
    readonly fType: TYPE
}> 

export type BaseMsg<FIELD_TYPE extends {kind: EntityKind.Field}> = NamedIntrafile<EntityKind.Message, ParentOfMany<FIELD_TYPE>> 

export type BaseImport<T> = NamedIntrafile<EntityKind.Import, T>

export type BaseConduitFile<
    MESSAGE_TYPE extends {kind: EntityKind.Message}, 
    ENUM_TYPE extends {kind: EntityKind.Enum}, 
    IMPORT_TYPE extends {kind: EntityKind.Import}> = 
Entity<EntityKind.File> & ParentOfMany<MESSAGE_TYPE> &  ParentOfMany<ENUM_TYPE> & ParentOfMany<IMPORT_TYPE> & {readonly loc: FileLocation}

type ParentOfMany<K extends Entity<EntityKind>> = {children: {readonly [P in K["kind"]]: K[]}} 

type IntrafileEntity<KIND extends EntityKind, DATA extends any> = {
    readonly loc: EntityLocation
} & Entity<KIND> & DATA

type NamedIntrafile<KIND extends EntityKind, DATA extends any> = IntrafileEntity<KIND, DATA & {
    readonly name: string
}> 

export type EnumMember = NamedIntrafile<EntityKind.EnumMember, {}>
export type Enum = NamedIntrafile<EntityKind.Enum, ParentOfMany<EnumMember>> 



