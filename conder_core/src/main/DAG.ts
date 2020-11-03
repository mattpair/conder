import {AnyOpInstance, ow, Utils, AnyInterpreterTypeInstance} from 'conder_kernel'

export type Node = Readonly<{
    compile: AnyOpInstance[]
}>


export class Return implements Node {


    public get compile(): AnyOpInstance[] {
        return [
            ow.instantiate(null),
            ow.returnStackTop
        ]
    }
}