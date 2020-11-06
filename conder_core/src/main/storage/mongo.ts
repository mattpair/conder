import { Utils } from 'conder_kernel';
import { AnyNode, LocalNodes, Node, LocalValue } from './../IR';


export type CompileReady = LocalNodes //| StorageNode

type StorageNode = 
    Node<"ReplaceKey", {global: string, key: LocalValue, value: LocalValue}>

export function global_elaboration(...nodes: AnyNode[]): CompileReady[] {

    // const ret: CompileReady[] = []

    // nodes.forEach(v => {
    //     switch(v.kind) {
    //         case "SetField":
    //             v.value
                
    //         default: 
    //             //@ts-ignore
    //             ret.push(v)
    //     }
    // })
    //@ts-ignore assume no globals
    return nodes
}