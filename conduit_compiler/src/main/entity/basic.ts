import { PrimitiveUnion as common } from '../lexicon';
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
"Primitive" |
"Function" |
"ParameterList" |
"ReturnTypeSpec" | 
"FunctionBody"

export type IntrafileEntityKinds = Exclude<EntityKinds, "File">

export type EntityLocation = {
    readonly startLineNumber: number
    readonly endLineNumber: number
    readonly startColNumber: number
    readonly endColNumber: number
}
type EntOf<KIND extends EntityKinds> = {kind: KIND}

type Entity<KIND extends EntityKinds> = {readonly kind: KIND}
export type BaseFieldType<DATA extends () => Entity<any>> = Entity<"FieldType"> & { differentiate: DATA}

export type BaseField<TYPE extends Entity<"FieldType">> = NamedIntrafile<"Field", {
    readonly isRequired: boolean
} & RequiresOne<TYPE>> 

export type BaseMsg<FIELD_TYPE extends {kind: "Field"}> = NamedIntrafile<"Message", ParentOfMany<FIELD_TYPE>> 

export type BaseImport<T> = NamedIntrafile<"Import", T>

export type BaseFunctionBody = IntrafileEntity<"FunctionBody", {}>
export type BaseReturnTypeSpec = IntrafileEntity<"ReturnTypeSpec", {}>
export type BaseParameterList = IntrafileEntity<"ParameterList", {}>
export type BaseFunction<BODY extends EntOf<"FunctionBody">, RET extends EntOf<"ReturnTypeSpec">, PARAM extends EntOf<"ParameterList">> = 
    NamedIntrafile<"Function", RequiresOne<BODY> & RequiresOne<RET> & RequiresOne<PARAM>>

export type BaseConduitFile<
    MESSAGE_TYPE extends EntOf<"Message">, 
    ENUM_TYPE extends EntOf<"Enum">, 
    IMPORT_TYPE extends EntOf<"Import">,
    FUNCTION_TYPE extends EntOf<"Function">> = 
Entity<"File"> & 
ParentOfMany<MESSAGE_TYPE> &  
ParentOfMany<ENUM_TYPE> & 
ParentOfMany<IMPORT_TYPE> & 
ParentOfMany<FUNCTION_TYPE> &
{readonly loc: FileLocation}

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
export type PrimitiveEntity = IntrafileEntity<"Primitive", {readonly val: common}>



