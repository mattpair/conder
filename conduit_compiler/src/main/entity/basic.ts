import { PrimitiveUnion as common } from '../lexicon';
import { FileLocation } from "../util/filesystem"

export type EntityKinds = 
"EnumMember" |
"Enum" |
"Message" |
"Field" |
"File" |
"FieldType" |
"CustomType" |
"Primitive" |
"Function" |
"ReturnTypeSpec" | 
"FunctionBody" | 
"Parameter" |
"NoParameter" |
"UnaryParameter" |
"UnaryParameterType" | 
"VoidReturnType" |
"Statement" |
"ReturnStatement"

export type IntrafileEntityKinds = Exclude<EntityKinds, "File">

export type EntityLocation = {
    readonly startLineNumber: number
    readonly endLineNumber: number
    readonly startColNumber: number
    readonly endColNumber: number
}
export type EntOf<KIND extends EntityKinds> = {kind: KIND}

export type Entity<KIND extends EntityKinds> = {readonly kind: KIND}

type PRODUCER = () => Entity<any>
export type PolymorphicEntity<KIND extends EntityKinds, OPTIONS extends PRODUCER> = Entity<KIND> & {differentiate: OPTIONS}
export type BaseFieldType<DATA extends () => Entity<any>> = PolymorphicEntity<"FieldType", DATA>

export type BaseField<TYPE extends Entity<"FieldType">> = NamedIntrafile<"Field", {
    readonly isRequired: boolean
} & RequiresOne<TYPE>> 

export type BaseMsg<FIELD_TYPE extends {kind: "Field"}> = NamedIntrafile<"Message", ParentOfMany<FIELD_TYPE>> 


export type BaseReturnStatement = IntrafileEntity<"ReturnStatement", {val: string}>
export type BaseStatement<DATA extends PRODUCER> = PolymorphicEntity<"Statement", DATA>
export type BaseFunctionBody<T extends EntOf<"Statement">> = IntrafileEntity<"FunctionBody", ParentOfMany<T>>
export type BaseReturnTypeSpec<DATA extends PRODUCER> = PolymorphicEntity<"ReturnTypeSpec", DATA>
export type BaseUnaryParameter<T extends EntOf<"UnaryParameterType">> = NamedIntrafile<"UnaryParameter", RequiresOne<T>>
export type BaseFunction<BODY extends EntOf<"FunctionBody">, RET extends EntOf<"ReturnTypeSpec">, PARAM extends EntOf<"Parameter">> = 
    NamedIntrafile<"Function", RequiresOne<BODY> & RequiresOne<RET> & RequiresOne<PARAM>>

export type ParentOfMany<K extends Entity<EntityKinds>> = {children: {readonly [P in K["kind"]]: K[]}}
export type RequiresOne<K extends Entity<EntityKinds>> = {readonly part: {[P in K["kind"]]: K}}

export type IntrafileEntity<KIND extends IntrafileEntityKinds, DATA extends any> = {
    readonly loc: EntityLocation
} & Entity<KIND> & DATA

type NamedIntrafile<KIND extends IntrafileEntityKinds, DATA extends any> = IntrafileEntity<KIND, DATA & {
    readonly name: string
}> 

export type EnumMember = NamedIntrafile<"EnumMember", {}>
export type Enum = NamedIntrafile<"Enum", ParentOfMany<EnumMember>> 
export type PrimitiveEntity = IntrafileEntity<"Primitive", {readonly val: common}>
export type VoidReturn = IntrafileEntity<"VoidReturnType", {}>


