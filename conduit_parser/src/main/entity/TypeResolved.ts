import { Struct, Enum, HierarchicalStore, EntityMap, PrimitiveEntity} from './resolved';
import {Parse} from '../parse'
import { FileLocation } from '../utils';
import { Primitives } from '../lexicon';


export namespace TypeResolved {
    export type Function = (Parse.Function & {readonly file: FileLocation})


    export type TopLevelEntities = Struct | Enum | Function | HierarchicalStore;
    export type Namespace = {
        readonly name: "default";
        readonly inScope: EntityMap<TopLevelEntities>;
    };
}

export function isPrimitive(type: Parse.CustomTypeEntity): PrimitiveEntity | undefined {
    const prim = Primitives.find(p => p === type.type)
    if (prim) {
        return {
            kind: "Primitive",
            loc: type.loc,
            val: prim,
            modification: type.modification
        }
    }
} 