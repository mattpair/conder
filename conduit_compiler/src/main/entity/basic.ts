import { PrimitiveUnion } from '../lexicon';
import { FileLocation } from "../util/filesystem"

export type EntityKinds = 
"EnumMember" |
"Enum" |
"Message" |
"Field" |
"Import" |
"File" |
"FieldType" |
"CustomType" |
"Primitive"
export type IntrafileEntityKinds = Exclude<EntityKinds, "File">

export type EntityLocation = {
    readonly startLineNumber: number
    readonly endLineNumber: number
    readonly startColNumber: number
    readonly endColNumber: number
}

type Entity<KIND extends EntityKinds> = {readonly kind: KIND}
export type BaseFieldType<DATA extends () => Entity<any>> = Entity<"FieldType"> & { differentiate: DATA}

export type BaseField<TYPE extends Entity<"FieldType">> = NamedIntrafile<"Field", {
    readonly isRequired: boolean
} & RequiresOne<TYPE>> 

export type BaseMsg<FIELD_TYPE extends {kind: "Field"}> = NamedIntrafile<"Message", ParentOfMany<FIELD_TYPE>> 

export type BaseImport<T> = NamedIntrafile<"Import", T>

export type BaseConduitFile<
    MESSAGE_TYPE extends {kind: "Message"}, 
    ENUM_TYPE extends {kind: "Enum"}, 
    IMPORT_TYPE extends {kind: "Import"}> = 
Entity<"File"> & ParentOfMany<MESSAGE_TYPE> &  ParentOfMany<ENUM_TYPE> & ParentOfMany<IMPORT_TYPE> & {readonly loc: FileLocation}

type ParentOfMany<K extends Entity<EntityKinds>> = {children: {readonly [P in K["kind"]]: K[]}}
type RequiresOne<K extends Entity<EntityKinds>> = {readonly part: {[P in K["kind"]]: K}}

export type IntrafileEntity<KIND extends IntrafileEntityKinds, DATA extends any> = {
    readonly loc: EntityLocation
} & Entity<KIND> & DATA

type NamedIntrafile<KIND extends IntrafileEntityKinds, DATA extends any> = IntrafileEntity<KIND, DATA & {
    readonly name: string
}> 

export type EnumMember = NamedIntrafile<"EnumMember", {}>
export type Enum = NamedIntrafile<"Enum", ParentOfMany<EnumMember>> 
export type PrimitiveEntity = IntrafileEntity<"Primitive", {readonly val: PrimitiveUnion}>



