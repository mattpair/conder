import {Node, PickNode, PickTargetNode, RequiredReplacer} from '../IR'


type Mongo = {
    GetWholeObject: Node<{name: string}>
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
        if (n.target.kind === "GlobalObject") {
            throw Error(`Cannot get field off global`)
        }
        return {
            kind: "GetField",
            target: n.target,
            field_name: n.field_name
        }
    },
    FieldExists(n, r) {
        if (n.value.kind === "GlobalObject") {
            throw Error(`Cannot check if globals exist`)
        }
        
        return {
            kind: "FieldExists",
            value: r(n.value),
            field: r(n.field)
        }
    },
    Update(n, r): PickTargetNode<Mongo, "Update"> {
        if (n.target.kind === "GlobalObject") {
            throw Error("cannot update global objects")
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