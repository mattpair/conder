import { AnyOpInstance, ow, Utils } from 'conder_kernel';
import { Transformer,Transform, Compiler } from './../compilers';
import {AnyNode, make_replacer, Node, PickNode, PickTargetNode, RequiredReplacer, TargetNodeSet} from '../IR'

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

const comparisonLookup: Record<PickNode<"Comparison">["sign"], AnyOpInstance[]> = {
    "!=": [ow.equal, ow.negatePrev],
    "==": [ow.equal],
    "<": [ow.less],
    ">": [ow.lesseq, ow.negatePrev],
    ">=": [ow.less, ow.negatePrev],
    "<=": [ow.lesseq]
}

const boolAlg: Record<PickNode<"BoolAlg">["sign"], AnyOpInstance[]> = {
    "and": [ow.boolAnd],
    "or": [ow.boolOr]
}

function compile_function(n: TargetNodeSet<Mongo>): AnyOpInstance[] {
    switch (n.kind) {
        case "GetWholeObject":
            throw Error("can't actually compile")
        case "Bool":
        case "Int":
        case "String":

            return [ow.instantiate(n.value)]
        case "BoolAlg":
            return [
                ...compile_function(n.left),
                ...compile_function(n.right),
                ...boolAlg[n.sign]
            ]
        case "Comparison":
            return [
                ...compile_function(n.left),
                ...compile_function(n.right),
                ...comparisonLookup[n.sign]
            ]
        case "FieldExists":
            return [
                ...compile_function(n.value),
                ...compile_function(n.field),
                ow.fieldExists
            ]
        case "GetKeyFromObject":
            break
        case "Object":
            return [
                ow.instantiate({}),
                ...n.fields.flatMap(compile_function)
            ]

        case "Return":
            return [
                ...(n.value ?  compile_function(n.value) : [ ow.instantiate(null) ]),
                ow.returnStackTop
            ]
        case "Save":
            return [...compile_function(n.value), ow.moveStackTopToHeap]
        case "Saved":
            return [ow.copyFromHeap(n.index)]
        
        case "SetField":
            return [
                ...n.field_name.flatMap(compile_function),
                ...compile_function(n.value),
                ow.setField({field_depth: n.field_name.length})
            ]
        case "SetKeyOnObject":
            break
        case "Update":
            if (n.target.kind !== "Saved") {
                throw Error(`Can only update non globals`)
            }
            switch (n.operation.kind) {
                case "SetField":
                    
                    return [
                        ...compile_function(n.target), 
                        ...compile_function(n.operation),
                        ow.overwriteHeap(n.target.index)
                    ]
                default: 
                    return [
                        ...compile_function(n.operation),
                        ow.overwriteHeap(n.target.index)
                    ]
            }
     
        case "keyExists":
            break
        case "GetField":
            return [
                ...compile_function(n.target),
                ...n.field_name.flatMap(compile_function),
                ow.getField({field_depth: n.field_name.length})
            ]
        case "If":{
            const ifTrue = compile_function(n.ifTrue)

            return [
                ...compile_function(n.cond),
                ow.negatePrev,
                ow.conditonallySkipXops(ifTrue.length),
                ...ifTrue,
                ...n.finally ? compile_function(n.finally) : [ow.noop] // give the opOffset somewhere to land.
            ]
        }
        default: Utils.assertNever(n)
    }
}

export const MONGO_COMPILER: MongoCompiler = new Transformer(compile_function)
