import { AnyOpInstance, ow } from 'conder_kernel';
import { AnyNode, make_replacer, Node, PickTargetNode, RequiredReplacer, TargetNodeSet } from '../IR';
import { base_compiler, Compiler, Transform, Transformer } from './../compilers';

type Mongo = {
    GetWholeObject: Node<{name: string}>,
    GetKeyFromObject: Node<{obj: string, key: PickTargetNode<Mongo, "String" | "Saved">[]}>
    keyExists: Node<{obj: string, key: PickTargetNode<Mongo, "String" | "Saved">}>
    SetKeyOnObject: Node<{obj: string, key: PickTargetNode<Mongo, "SetField">["field_name"], value: PickTargetNode<Mongo, "SetField">["value"]}>
}


const MONGO_REPLACER: RequiredReplacer<Mongo> = {
    If(n, r) {
        return {
            kind: "If",
            cond: n.cond,
            ifTrue: r(n.ifTrue),
            finally: r(n.finally),
        }
    },

    Object(n, r) {
        return {
            kind: "Object",
            fields: n.fields.map(f => r(f))
        }
    },

    Return(n, r) {
        if (n.value?.kind === "GlobalObject") {
            throw Error(`Cannot return global objects`)
        }

        return {
            kind: "Return",
            value: n.value ? r(n.value) : undefined
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

export const MONGO_GLOBAL_ABSTRACTION_REMOVAL: Transform<AnyNode, TargetNodeSet<Mongo>> = new Transformer(make_replacer(MONGO_REPLACER))


type MongoCompiler = Compiler<TargetNodeSet<Mongo>>

function compile_function(n: TargetNodeSet<Mongo>): AnyOpInstance[] {
    switch (n.kind) {
        case "GetWholeObject":
            throw Error("can't actually compile")
        
        
        case "GetKeyFromObject":

            return [
                // Create the query doc
                ow.instantiate({_key: {}}),
                // Search for key equal to compile function
                ow.instantiate("_key"),
                ...base_compiler(n.key[0], compile_function),
                ow.setField({field_depth: 1}),
                ow.findOneInStore([n.obj, {}]),
            ]

            
        

        case "SetKeyOnObject":
            break
        
     
        case "keyExists":
            break
        
        default: return base_compiler(n, compile_function)
    }
}

export const MONGO_COMPILER: MongoCompiler = new Transformer(compile_function)
