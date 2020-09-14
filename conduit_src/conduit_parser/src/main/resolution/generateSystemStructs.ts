
import { SchemaInstance, SchemaType, schemaFactory, AnySchemaInstance } from './../SchemaFactory';
import { PartialEntityMap } from './typeValidation';
import { Parse } from '../parse';
import { Struct, HierarchicalStore, } from "../entity/resolved";
import { assertNever } from "../utils";
import { Symbol } from '../lexicon';




export function generateSystemObjects(entityMapInternal: PartialEntityMap): PartialEntityMap {

    entityMapInternal.forEach(v => {
        switch(v.kind) {
            case "HierarchicalStore":
                
                const spec = generateQuerySpec(v)

                if (entityMapInternal.has(spec.name)) {
                    throw Error(`Unexpected collision on struct name ${spec.name}`)
                }
                entityMapInternal.set(spec.name, spec)
        }
    })
    return entityMapInternal
}

function generateQuerySpec(store: HierarchicalStore): Struct {

    const fields: Parse.Field[] = []
    // function toQuerySpec(s: AnySchemaInstance): AnySchemaInstance {
    //     switch(s.kind) {
    //         case "Array":
    //             return schemaFactory.Array(toQuerySpec(s.data[0]))
    //         case "Object":
    //             const spec: SchemaInstance<"Object"> = {kind: "Object", data: {}}
    //             for (const key in s.data) {
    //                 spec.data[key] = toQuerySpec(s.data[key])
    //             }
    //             return spec
    //         case "Optional":
    //             return schemaFactory.Optional(toQuerySpec(s.data[0]))
    //         case Symbol.double:
    //         case Symbol.bool:
    //         case Symbol.int:
    //         case Symbol.string:
    //             return s
                
    //             default: assertNever(s)
    //     }
    // }

    const schema: SchemaInstance<"Object"> = schemaFactory.Object({getAll: schemaFactory.bool})
    
    
    return {
        kind: "Struct", 
        name: store.specName, 
        schema,
        isConduitGenerated: true
    }
}