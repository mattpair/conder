import {Enum, BaseField, BaseMsg, BaseImport, BaseFieldType, PrimitiveEntity, ParentOfMany, Entity} from './basic'
import { Parse } from 'parse';
import { FileLocation } from 'util/filesystem';

export namespace TypeResolved {

    // Part of the reason we must use functions for field types is so the types don't circularly reference. Message->FieldType->Message.
    export type FieldType = BaseFieldType<() => (Message | Enum | PrimitiveEntity)>

    
    export type Field = BaseField<FieldType>

    export type Message = BaseMsg<Field>
    export type Import =BaseImport<{dep: string}>

    type BaseResolvedFile<F extends Entity<"Function">> = 
    Entity<"File"> & 
    ParentOfMany<F> &
    ParentOfMany<Import> &
    {
        readonly loc: FileLocation
        readonly entityLookup: ReadonlyMap<string, Message | Enum>
        // readonly importedEntityLookup: ReadonlyMap<string, () => ReadonlyMap<string, Message | Enum>>
    }

    export type File = BaseResolvedFile<Parse.Function> 
}
