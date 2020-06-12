import { PrimitiveUnion } from '../lexicon';
import { Classified } from '../util/classifying';
import {Enum, EntityKind, BaseField, BaseMsg, BaseConduitFile, BaseImport} from './basic'

export namespace Resolved {

    export type FieldType = 
    Classified<EntityKind.Message, () => Message> |
    Classified<EntityKind.Enum, () => Enum> |
    Classified<"primitive", PrimitiveUnion> 

    
    export type Field = BaseField<FieldType>

    export type Message = BaseMsg<Field>
    export type Import =BaseImport<{dep: string}>
    export type ConduitFile = BaseConduitFile<Message, Enum, Import>
}
