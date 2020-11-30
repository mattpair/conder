import { AnyOpInstance, ow } from '../../ops/index';
import { AnyNode, make_replacer, Node, PickTargetNode, RequiredReplacer, TargetNodeSet } from '../IR';
import { base_compiler, Compiler, Transform, Transformer } from '../compilers';
import { FunctionDescription } from '../function';

export type MongoNodeSet = {
    GetWholeObject: Node<{name: string}>,
    GetKeyFromObject: Node<{obj: string, key: PickTargetNode<MongoNodeSet, "String" | "Saved">[]}>
    keyExists: Node<{obj: string, key: PickTargetNode<MongoNodeSet, "String" | "Saved">}>
    SetKeyOnObject: Node<{obj: string, key: PickTargetNode<MongoNodeSet, "SetField">["field_name"], value: PickTargetNode<MongoNodeSet, "SetField">["value"]}>,
    DeleteKeyOnObject: Node<{obj: string, key: PickTargetNode<MongoNodeSet, "SetField">["field_name"]}>
}


const MONGO_REPLACER: RequiredReplacer<MongoNodeSet> = {
    If(n, r) {
        return {
            kind: "If",
            conditionally: n.conditionally.map(r)
        }
    },
    Else(n, r) {
        return {kind: "Else", do: r(n.do)}
    },
    Finally(n, r) {
        return {kind: "Finally", do: r(n.do)}
    },
    Conditional(n, r) {
        if (n.cond.kind === "GlobalObject") {
            throw Error(`Global objects cannot be used as conditions`)
        }
        return {kind: "Conditional", cond: r(n.cond), do: r(n.do)}
    },

    Comparison(n, r) {
        if (n.left.kind === "GlobalObject" || n.right.kind === "GlobalObject") {
            throw Error(`Global objects cannot be used in boolean alg`)
        }
        return {
            kind: "Comparison",
            left: r(n.left),
            right: r(n.right),
            sign: n.sign
        }
    },

    BoolAlg(n, r) {
        if (n.left.kind === "GlobalObject" || n.right.kind === "GlobalObject") {
            throw Error(`Global objects cannot be used in boolean alg`)
        }
        return {
            kind: "BoolAlg",
            left: r(n.left),
            right: r(n.right),
            sign: n.sign
        }
    },

    Math(n, r) {
        return {
            kind: "Math",
            sign: n.sign,
            left: r(n.left),
            right: r(n.right)
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

    SetField(n, r): PickTargetNode<MongoNodeSet, "SetField"> {
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

                    case "DeleteField":
                        return {
                            kind: "DeleteKeyOnObject",
                            obj: n.target.name,
                            key: n.operation.field_name.map(r)
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
const complete_replace = make_replacer(MONGO_REPLACER) 
export const MONGO_GLOBAL_ABSTRACTION_REMOVAL: Transform<Map<string, FunctionDescription>, Map<string, TargetNodeSet<MongoNodeSet>[]>> = Transformer.Map((i) => i.computation.map(complete_replace))

type MongoCompiler = Compiler<Map<string, TargetNodeSet<MongoNodeSet>[]>>

function compile_function(n: TargetNodeSet<MongoNodeSet>): AnyOpInstance[] {
    switch (n.kind) {
        case "GetWholeObject":
            throw Error("can't actually compile")
        
        // Assume key depth is one
        case "GetKeyFromObject":
            const manyKeySuccess: AnyOpInstance[] = []
            const manyKeyFail: AnyOpInstance[] = []
            if (n.key.length > 1) {
                manyKeySuccess.push(
                    ...n.key.slice(1).flatMap(compile_function),
                    ow.getField({field_depth: n.key.length - 1})
                )

                manyKeyFail.push(ow.raiseError("Key does not exist on global"))
            }
            return [
                // Create the query doc
                ow.instantiate({_key: {}}),
                // Search for key
                ow.instantiate("_key"),
                ...base_compiler(n.key[0], compile_function),
                ow.setField({field_depth: 1}),
                ow.findOneInStore([n.obj, {}]),
                ow.isLastNone,
                ow.conditonallySkipXops(1 + manyKeySuccess.length + 1),
                ow.tryGetField("_val"),
                ...manyKeySuccess,
                ow.offsetOpCursor(manyKeyFail.length + 1),
                ...manyKeyFail,
                ow.instantiate(null)
            ]

            
        case "SetKeyOnObject":
            const updateDocumentCreation: AnyOpInstance[] = []
            if (n.key.length > 1) {
                updateDocumentCreation.push(
                    ow.instantiate({"$set": {}}),
                    ow.instantiate("$set"),
                    ow.instantiate("_val"),
                    ...n.key.slice(1).flatMap(compile_function),
                    ow.stringConcat({nStrings: n.key.length, joiner: "."}),
                    ...compile_function(n.value),
                    ow.setField({field_depth: 2})
                )
            } else {
                updateDocumentCreation.push( 
                    ow.instantiate({"$set": {_val: {}}}),
                    ow.instantiate("$set"),
                    ow.instantiate("_val"),
                    ...compile_function(n.value),
                    ow.setField({field_depth: 2}),
                )
            }
            return [
                ...updateDocumentCreation,
                // Create the query doc
                ow.instantiate({_key: {}}),
                ow.instantiate("_key"),
                ...base_compiler(n.key[0], compile_function),
                ow.setField({field_depth: 1}),
                // update or insert key
                ow.updateOne({store: n.obj, upsert: n.key.length === 1}),
                ow.isLastNone,
                ow.conditonallySkipXops(2),
                ow.popStack,
                ow.offsetOpCursor(1),
                ow.raiseError("Nested key does not exist"),
            ]
        
     
        case "keyExists":
            return [
                ow.instantiate({_key: {}}),
                // Search for key
                ow.instantiate("_key"),
                ...base_compiler(n.key, compile_function),
                ow.setField({field_depth: 1}),
                // We don't need the value, so just suppress it.
                ow.findOneInStore([n.obj, {_val: false}]),
                ow.isLastNone,
                ow.conditonallySkipXops(3),
                ow.popStack,
                ow.instantiate(true),
                ow.offsetOpCursor(2),
                ow.popStack,
                ow.instantiate(false)
            ]
        

        case "DeleteKeyOnObject": {
            if (n.key.length > 1) {
                return [
                    ow.instantiate({"$unset": {}}),
                    ow.instantiate("$unset"),
                    ow.instantiate("_val"),
                    ...n.key.slice(1).flatMap(compile_function),
                    ow.stringConcat({nStrings: n.key.length, joiner: "."}),
                    ow.instantiate(""),
                    ow.setField({field_depth: 2}),
                    ow.instantiate({_key: {}}),
                    ow.instantiate("_key"),
                    ...compile_function(n.key[0]),
                    ow.setField({field_depth: 1}),
                    ow.updateOne({store: n.obj, upsert: false}),
                    ow.popStack
                ]
                    
            } else {
                return  [
                    ow.instantiate({_key: {}}),
                    ow.instantiate("_key"),
                    ...base_compiler(n.key[0], compile_function),
                    ow.setField({field_depth: 1}),
                    ow.deleteOneInStore(n.obj),
                    ow.popStack
                ]
            }
        }
            

        default: return base_compiler(n, compile_function)
    }
}

export const MONGO_COMPILER: MongoCompiler = Transformer.Map(inp => inp.flatMap(compile_function))
