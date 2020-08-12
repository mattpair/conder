import { Struct, Enum, HierarchicalStore, EntityMap } from './resolved';
import {Parse} from '../parse'
import { FileLocation } from '../utils';


export namespace TypeResolved {
    export type Function = (Parse.Function & {readonly file: FileLocation})


    export type TopLevelEntities = Struct | Enum | Function | HierarchicalStore;
    export type Namespace = {
        readonly name: "default";
        readonly inScope: EntityMap<TopLevelEntities>;
    };
}
