import { AnyOpInstance } from 'conder_kernel';
export declare type Action = {
    kind: "return";
};
export declare type Select = {
    kind: "select";
    store: string;
    after: Action;
};
export declare type Node = Action | Select;
export declare function to_instruction(node: Node): AnyOpInstance[];
