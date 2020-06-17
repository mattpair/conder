import { PrimitiveUnion } from '../lexicon';
import { Classified } from '../util/classifying';
import {Enum, EntityKind, BaseField, BaseMsg, BaseConduitFile, BaseImport, BaseFieldType, PrimitiveEntity} from './basic'

export namespace Resolved {

    // Part of the reason we must use functions for field types is so the types don't circularly reference. Message->FieldType->Message.
    export type FieldType = BaseFieldType<() => (Message | Enum | PrimitiveEntity)>

    
    export type Field = BaseField<FieldType>

    export type Message = BaseMsg<Field>
    export type Import =BaseImport<{dep: string}>
    export type ConduitFile = BaseConduitFile<Message, Enum, Import>
}
