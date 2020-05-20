
export interface Classified<D, T=undefined> {
    readonly kind: D
    readonly val: T
}

export class ClassifiedClass<KIND, T> implements Classified<KIND, T>{
    readonly kind: KIND
    readonly val: T

    constructor(kind: KIND, val: T) {
        this.kind = kind
        this.val = val
    }
}

export function StatelessClassification<D>(d: D): Classified<D>  {
    return {kind: d, val: undefined}
}

export function LazyStatelessClassification<D>(d: D): (ignore: any) => Classified<D> {
    const c = StatelessClassification(d)
    return (a: any) => {
        return c
    }
}

export function LazyClassification<T>(d: any): (a: T) => Classified<any, T> {
    return (a: T) =>  {
        return {
            kind: d,
            val: a
        }
    }
}


export function assertNever(x: never): never {
    throw new Error("Unexpected object: " + x);
}
