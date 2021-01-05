import { ValueNode } from "../abstract/IR";
import { SchemaInstance, SchemaType } from "../ops";


type InternalDiscriminateStep<P extends SchemaType> = {
    check: (to_discriminate: ValueNode) => ValueNode
    ifTrue: SchemaInstance<P>
}
export type DiscriminateStep<P extends SchemaType> = Readonly<{
    ifTrue: SchemaInstance<P>
    check: ValueNode
}>

export interface Discriminator {
    readonly union: SchemaInstance<"Union">
    
    match(v: ValueNode): DiscriminateStep<SchemaType>[]
    just<P extends SchemaType>(i: SchemaInstance<P>): DiscriminateStep<P>
}



export class ObjectsOnlyDiscriminator implements Discriminator {
    readonly union: SchemaInstance<"Union">
    private readonly entirely: InternalDiscriminateStep<SchemaType>[]

    public static for(u: SchemaInstance<"Union">): ObjectsOnlyDiscriminator | "contains non-objects" {
        if (!u.data.every(opt => opt.kind === "Object")) {
            return "contains non-objects"
        }
        return new ObjectsOnlyDiscriminator(u)
    }

    private constructor(u: SchemaInstance<"Union">) {        
        this.union = u
    }

    just<P extends SchemaType>(i: SchemaInstance<P>): DiscriminateStep<P> {
        return {check: {kind: "Int", value: 12}, ifTrue: i}
    }

    match(v: ValueNode): DiscriminateStep<SchemaType>[] {
        return this.entirely.map(step => {
            return {
                ifTrue: step.ifTrue,
                check: step.check(v)
            }
        })
    }
}



