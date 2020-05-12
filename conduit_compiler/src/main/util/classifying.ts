
export interface Classified<D, T=undefined> {
    readonly kind: D
    readonly val: T
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