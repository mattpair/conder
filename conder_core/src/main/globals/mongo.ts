import {Node, PickNode, PickTargetNode, RequiredReplacer, TargetNodeSet} from '../IR'

type Mongo = {
    GetWholeObject: Node<{name: string}>,
    GetKeyFromObject: Node<{obj: string, key: PickTargetNode<Mongo, "String" | "Saved">[]}>
    keyExists: Node<{obj: string, key: PickTargetNode<Mongo, "String" | "Saved">}>
    SetKeyOnObject: Node<{obj: string, key: PickTargetNode<Mongo, "SetField">["field_name"], value: PickTargetNode<Mongo, "SetField">["value"]}>
}


export const MONGO_REPLACER: RequiredReplacer<Mongo> = {
    If(n, r) {
        return {
            kind: "If",
            cond: n.cond,
            ifTrue: r(n.ifTrue),
            finally: r(n.finally),
        }
    },

    Return(n: PickNode<"Return">): PickTargetNode<Mongo, "Return"> {
        return {
            kind: "Return",
            value: n.value ? this[n.kind](n) : undefined
        }
    },

    Save(n, r) {
        if (n.value.kind === "GlobalObject") {
            throw Error(`Cannot save global objects`)
        }

        return {
            kind: "Save",
            index: n.index,
            value: r(n.value)
        }
    },

    SetField(n, r): PickTargetNode<Mongo, "SetField"> {
        if (n.value.kind === "GlobalObject") {
            throw Error("cannot set values from global objects")
        }
        return {
            kind: "SetField",
            field_name: n.field_name.map(r),
            value: r(n.value)
        }
    },
    GetField(n, r) {
        switch (n.target.kind) {
            case "GlobalObject":
                return {
                    kind: "GetKeyFromObject",
                    obj: n.target.name,
                    key: n.field_name.map(r)
                }
            case "Saved":
                return {
                    kind: "GetField",
                    target: n.target,
                    field_name: n.field_name.map(r)
                }
        }
    
    },
    FieldExists(n, r) {

        switch (n.value.kind) {
            case "GlobalObject":
                return {
                    kind: "keyExists",
                    obj: n.value.name,
                    key: n.field
                }
        }
        
        return {
            kind: "FieldExists",
            value: r(n.value),
            field: r(n.field)
        }
    },
    Update(n, r) {

        switch (n.target.kind) {
            case "GlobalObject":
                switch (n.operation.kind) {
                    case "SetField":
                        if (n.operation.value.kind === "GlobalObject") {
                            throw Error(`Cannot set key to a global object`)
                        }
                        return {
                            kind: "SetKeyOnObject",
                            obj: n.target.name,
                            key: n.operation.field_name,
                            value: r(n.operation.value)
                        }
                }

                throw Error(`Could not fulfill global object update`)
        }
        if (n.operation.kind === "GlobalObject") {
            throw Error("cannot set value from global object")
        }
        
        return {
            kind: "Update",
            target: n.target,
            operation: r(n.operation)
        }
    },
}