import { RootNode } from './IR';
import { AnyOpInstance } from 'conder_kernel';

type Transform<I, O> = {
    then<N>(f: (o: O) => N): Transform<I, N>

    run(i: I): O
}

type Compiler<I> = Transform<I, AnyOpInstance[]>



class Transformer<I, O> implements Transform<I, O> {
    readonly f: (i: I) => O
    constructor(f: (i: I) => O) {}
    
    then<N>(f: (o: O) => N): Transform<I, N> {
        return new Transformer((i: I) => f(this.f(i)))
    }

    run(i: I): O {
        return this.f(i)
    }
}