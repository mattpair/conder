import { Struct, Enum, Function, Store, EntityMap } from './resolved';

export namespace TypeResolved {
    export type TopLevelEntities = Struct | Enum | Function | Store;
    export type Namespace = {
        readonly name: "default";
        readonly inScope: EntityMap<TopLevelEntities>;
    };
}
