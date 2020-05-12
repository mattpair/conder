import { Classified, LazyClassification } from './util/classifying';
import { Dynamic, VariableDefinition, NumberDefinition, Keywords, Symbol, Primitives, Operators, PrimitiveUnion } from './lexicon';


function onlyStandingAlone(s: string): RegExp {
    return new RegExp(`^${s}$`)
}

function anywhere(s: string): RegExp {
    return new RegExp(`${s}`)
}

export enum TagType {
    Symbol,
    Primitive,
    String,
    Number,
}

export const SymbolToken = LazyClassification<Symbol>(TagType.Symbol)
export const IntToken = LazyClassification<number>(TagType.Number)
export const StringToken = LazyClassification<string>(TagType.String)
export const PrimitiveToken = LazyClassification<PrimitiveUnion>(TagType.Primitive)

export type ValidToken = 
Classified<TagType.Number, number> | 
Classified<TagType.Primitive, PrimitiveUnion> |
Classified<TagType.String, string> | 
Classified<TagType.Symbol, Symbol> 

type SymbolRegexTuple<S=Symbol> = [S, RegExp]

const OperatorRegexes: SymbolRegexTuple[] = Operators.map(s => [s, anywhere(s)])
const KeywordRegexes: SymbolRegexTuple[] = Keywords.map(s => [s, onlyStandingAlone(s)])
const PrimitiveRegexes: SymbolRegexTuple<PrimitiveUnion>[] = Primitives.map(s => [s, onlyStandingAlone(s)])

const regexes: SymbolRegexTuple[][] = [
    OperatorRegexes,
    KeywordRegexes,   
]

function tokenize(s: string): ValidToken  {
    for (let i=0; i < regexes.length; ++i) {
        const hit = regexes[i].find((d) => {
            return d[1].test(s)
        })
        if (hit !== undefined) {
            return {kind: TagType.Symbol, val: hit[0]}
        }
    }
    
    const prim = PrimitiveRegexes.find((a) => a[1].test(s))
    if (prim) {
        return PrimitiveToken(prim[0])
    }

    // TODO: deduplicate the following
    
    const variable = VariableDefinition[1].test(s)
    if (variable) {
        return StringToken(s)
    }

    const number = NumberDefinition[1].test(s)
    if (number) {
        return IntToken(Number.parseInt(s))
    }

    throw Error(`Cannot identify token: ${JSON.stringify(s)}`)
}

const anySymbol = `(${OperatorRegexes.map(r => r[1].source).join("|")})`
const spaceBeforeAndAfterSymbol = new RegExp(`${anySymbol}`, "g")


export function tokenizePage(s: String): ValidToken[] {
    const strs = s.replace(spaceBeforeAndAfterSymbol, " $& ").replace(/[\r\t\f\v ]+/g, " ").split(" ")
    const a = strs.reduce((prev, current) => {
        return [...prev, current]
    }, [])
    .map(t => t.replace(" ", "")).filter(t => t)
    
    // console.log(JSON.stringify(a, null, 2))

    const b = a.map((a) => tokenize(a))

    // console.log(JSON.stringify(b, null, 2))
    return b
}