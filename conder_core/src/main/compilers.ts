import { RootNode } from './IR';
import { AnyOpInstance } from 'conder_kernel';

export type Transform<I, O> = {
    then<N>(t: Transform<O, N>): Transform<I, N>

    run(i: I): O
}

export type Compiler<I> = Transform<I, AnyOpInstance[]>



export class Transformer<I, O> implements Transform<I, O> {
    readonly f: (i: I) => O
    constructor(f: (i: I) => O) {this.f= f}
    
    then<N>(t: Transform<O, N>): Transform<I, N> {
        return new Transformer((i: I) => t.run(this.f(i)))
    }

    run(i: I): O {
        return this.f(i)
    }
}