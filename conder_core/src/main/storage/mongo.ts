import { Utils } from 'conder_kernel';
import { AnyNode, LocalNodes } from './../IR';


export type CompileReady = LocalNodes

export function global_elaboration(...nodes: AnyNode[]): CompileReady[] {
    // For the time being, just no globals are present.
    //@ts-ignore
    return nodes
}