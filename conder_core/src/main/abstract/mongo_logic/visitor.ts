
import { MongoNodeSet } from '../globals/mongo';
import { TargetNodeSet, NodeSet, PickTargetNode } from "../IR";

type TargetNodes = TargetNodeSet<MongoNodeSet>
type Visitor = {
    before: (n: TargetNodes) => TargetNodes[]
    after: (n: TargetNodes) => void
}

export function apply(nodes: TargetNodeSet<MongoNodeSet>[], visitor: Visitor) {
    nodes.forEach(n => {
        const children = visitor.before(n)
        apply(children, visitor)
        visitor.after(n)
    })
}


type Subscriptions = Partial<{
    [K in TargetNodes["kind"]]: {
        before: (n: PickTargetNode<MongoNodeSet, K>) => void
        after: (n: PickTargetNode<MongoNodeSet, K>) => void
    }
}>
// Sees everything but does nothing.
export class DummyVisitor implements Visitor {

    private readonly subs: Subscriptions
    constructor(subs: Subscriptions) {
        this.subs = subs
    }   

    before(n: TargetNodes): TargetNodes[] {
        
        if (this.subs[n.kind]) {
            //@ts-ignore
            this.subs[n.kind].before(n)
        }
        
        // It would make me oh so happy if there was a generic type that could said:
        // For all nodes, for those fields of the nodes that point to nodes (i.e. are edges),
        // specify the traversal priority across the edges.
        // Then a generic visitor object could be initialized with that.
        switch (n.kind) {
            case "Save":                
                return [n.value]
            case "Return":
                return n.value ? [n.value] : []
            case "Object":
                return n.fields

            case "Math":
            case "Comparison":
            case "BoolAlg":
                return [n.left, n.right]
                
            case "If":
                return [n.cond, n.ifTrue, ...n.ifTrue ? [n.ifTrue] : []]

            case "GetKeyFromObject":
            case "DeleteKeyOnObject":
                return n.key

            case "GetField":
                return [n.target, ...n.field_name]

            case "FieldExists":
                return [n.value, n.field]

            case "DeleteField":
                return n.field_name
            
            case "keyExists":
                return [n.key]
            case "Update":
                return [n.target, n.operation]
            case "SetKeyOnObject":
                return [...n.key, n.value]
            case "SetField":                
                return [...n.field_name, n.value]

            case "Int":                
            case "GetWholeObject":
            case "Bool":
            case "String":
            case "Saved":
                return []
            default: 
                const ne: never = n
                
        }
    }

    after(n: TargetNodes) {
        if (this.subs[n.kind]) {
            //@ts-ignore
            this.subs[n.kind].after(n)
        }
    }

}

