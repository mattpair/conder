import { PartialEntityMap } from './typeValidation';
import { Parse } from '../parse';
import { Function, ScopeMap, Struct, Enum, EntityMap, HierarchicalStore, ReturnType, Variable } from "../entity/resolved";
import { assertNever } from "../utils";




export function generateSystemObjects(entityMapInternal: PartialEntityMap): PartialEntityMap {

    entityMapInternal.forEach(v => {
        switch(v.kind) {
            case "HierarchicalStore":
                
                generateSystemStructs(v).forEach(struct => {
                    if (entityMapInternal.has(struct.name)) {
                        throw Error(`Unexpected collision on struct name ${struct.name}`)
                    }
                    entityMapInternal.set(struct.name, struct)
                })
                
        }
    })
    return entityMapInternal
}

function generateSystemStructs(store: HierarchicalStore): Struct[] {

    const fields: Parse.Field[] = []
    const children: Struct[] = []
    store.columns.forEach(col => {
        switch (col.dif) {
            case "prim":
            case "enum":
                // plainColumnStrs.push(`const ${store.name}_${col.columnName}: &'static str = "${col.columnName}";`)
                break

            case "1:many":
            case "1:1":
                fields.push({
                    kind: "Field", 
                    part: {
                        CompleteType: {kind: "CompleteType", differentiate: () => ({kind: "TypeName", name: col.ref.specName})}    
                    },
                    name: col.fieldName
                })
                children.push(...generateSystemStructs(col.ref))
                break

            default: assertNever(col)
        }
    })
    return [...children, {
        kind: "Struct", 
        name: store.specName, 
        children: {
            Field: fields
        },
        isConduitGenerated: true
    }]
}