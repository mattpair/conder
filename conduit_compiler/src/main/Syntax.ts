import { Classified, LazyClassification, ClassifiedClass } from './util/classifying';
import { Symbol, PrimitiveUnion, Primitives, Operators, Keywords } from './lexicon';
import { Unresolved, Resolved } from './entities';

export enum Meaning {
    START_OF_FILE="Start of File",
    MESSAGE_DECLARATION="MESSAGE_NAME",
    ENTITY_END="ENTITY_END",
    FIELD_OPTIONAL="FIELD_OPTIONAL",
    FIELD_TYPE_PRIMITIVE="FIELD_TYPE_PRIMITIVE",
    FIELD_TYPE_CUSTOM="FIELD_TYPE_CUSTOM",
    FIELD_NAME="FIELD_NAME",
    FIELD_END="FIELD_END",
    ENUM_DECLARATION="ENUM",
    IMPORT="IMPORT",
    ENUM_MEMBER="Enum member",
    // FUNCTION_NAME="FUNCTION_NAME"
}

const FieldTyped = LazyClassification<PrimitiveUnion>(Meaning.FIELD_TYPE_PRIMITIVE)
const FieldNamed = LazyClassification<string>(Meaning.FIELD_NAME)
const MessagedNamed = LazyClassification<string>(Meaning.MESSAGE_DECLARATION)
// const FunctionNamed = LazyClassification<string>(Meaning.FUNCTION_NAME)
class Enum extends ClassifiedClass<Meaning.ENUM_DECLARATION, Resolved.Enum> {
    constructor(name: string) {
        super(Meaning.ENUM_DECLARATION, {members: [], name})
    }
}
const FieldTypedCustom = LazyClassification<Unresolved.CustomType>(Meaning.FIELD_TYPE_CUSTOM)
const Import = LazyClassification<Unresolved.Import>(Meaning.IMPORT)

export type SemanticTokenUnion = 
| Classified<Meaning.ENUM_DECLARATION, Resolved.Enum>
| Classified<Meaning.ENUM_MEMBER, string>
| Classified<Meaning.ENTITY_END>
| Classified<Meaning.FIELD_END>
| Classified<Meaning.IMPORT, Unresolved.Import>
| Classified<Meaning.FIELD_TYPE_PRIMITIVE, PrimitiveUnion>
| Classified<Meaning.FIELD_NAME, string>
| Classified<Meaning.MESSAGE_DECLARATION, string>
| Classified<Meaning.FIELD_OPTIONAL>
| Classified<Meaning.FIELD_TYPE_CUSTOM, Unresolved.CustomType>
// | Classified<Meaning.FUNCTION_NAME, string>

type RegexCaptureType = {[key: string]: string}

export type SemanticTokenMaker = Classified<"symbol", SemanticTokenUnion> 
| Classified<"regex", (s: RegexCaptureType) => SemanticTokenUnion>

type SyntaxLookup = Map<Meaning, {regex: RegExp, make: SemanticTokenMaker}[]>

class TransitionBuilder {
    readonly LastMeaningToNextSymbolMap: SyntaxLookup = new Map()

    presentFromMeanings: Meaning[]
    symbols: Symbol[]

    matchesSymbols(maker: (s: Symbol) => SemanticTokenUnion, ...symbols: Symbol[]) {

        this.presentFromMeanings.forEach(from => {
            this.LastMeaningToNextSymbolMap.get(from).push(...symbols.map(sym => {

                const make: SemanticTokenMaker = {
                    kind: "symbol",
                    val: maker(sym)
                }
                return {
                    regex: SymbolToRegex[sym],
                    make
                }
            }))
        })
        
        return this
    }

    symbolsMean(m: Meaning, ...s: Symbol[]) {
        const val =  () => {
            return {
                kind: m
            } as SemanticTokenUnion
        }
        this.matchesSymbols(val, ...s)
        return this
    }

    matches(regex: RegExp, val: (s: {[key: string]: string}) => SemanticTokenUnion) {
        this.presentFromMeanings.forEach(from => {
            this.LastMeaningToNextSymbolMap.get(from).push({
                regex,
                make: {
                    kind: "regex",
                    val
                }
            })
        })
        return this
    }

    // common phrases
    canStartField() {
        this.symbolsMean(Meaning.FIELD_OPTIONAL, Symbol.optional)
        this.canProvideFieldType()
        return this
    }

    canProvideFieldType() {
        this.matchesSymbols((s: Symbol) => FieldTyped(s as PrimitiveUnion), ...Primitives)
        this.matches(/^((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*)/,
        (s: RegexCaptureType) => FieldTypedCustom({type: s.type, from: s.from}))
        
        return this
    }

    from(...f: Meaning[]) {
        this.presentFromMeanings = f
        f.forEach(state => {
            if (this.LastMeaningToNextSymbolMap.has(state)) {
                return
            }

            this.LastMeaningToNextSymbolMap.set(state, [])
        })
        
        return this
    }
}

const regexSymbolPartial: Partial<Record<Symbol, RegExp>> = {}
Operators.forEach(op => {
    regexSymbolPartial[op] =  new RegExp(`^${op}`)
});

[...Keywords, ...Primitives].forEach(p => {
    regexSymbolPartial[p] = new RegExp(`^${p}\\s`)
})

    // r[Symbol.FUCTION_DECLARATION] = /^function +(?<name>[a-zA-Z_]\w*)\(/
    
export const SymbolToRegex: Record<Symbol, RegExp> = regexSymbolPartial as Record<Symbol, RegExp>
export const AnyReservedWord: RegExp = new RegExp(`^(${[...Keywords, ...Primitives].map(s => SymbolToRegex[s].source.slice(1).replace("\\s", "")).join("|")})$`)

function makeStateMatcher(): SyntaxLookup {

    const transitions  = new TransitionBuilder()

    const VariableName = /^(?<name>[_A-Za-z]+[\w]*)/

    transitions.from(Meaning.START_OF_FILE, Meaning.ENTITY_END, Meaning.IMPORT)
        .matches(/^message +(?<name>[a-zA-Z_]\w*) *{/, (s) => MessagedNamed(s.name))
        .matches(/^enum +(?<name>[a-zA-Z]+) *{\s*/, (s) => new Enum(s.name))
        .matches(/^import +'(?<presentDir>\.\/)?(?<location>[\w \.\/]*)' +as +(?<name>[_A-Za-z]+[\w]*)/, (s) => Import({
            fromPresentDir: s.presentDir !== undefined,
            location: s.location,
            alias: s.name 
        }))
        // .whenMatching(Symbol.FUCTION_DECLARATION).causes((s: SymbolMatch) => [SyntaxState.FUNCTION_NAMED, FunctionNamed(s[1].name)]) 
    
            
    transitions.from(Meaning.ENUM_DECLARATION, Meaning.ENUM_MEMBER)
    .matches(/^\s*(?<name>[a-zA-Z]+)(,|[\s]+)\s*/, (s) => ({kind: Meaning.ENUM_MEMBER, val: s.name}))
    
    transitions.from(Meaning.ENUM_MEMBER)
    .symbolsMean(Meaning.ENTITY_END, Symbol.CLOSE_BRACKET)

    transitions.from(Meaning.MESSAGE_DECLARATION).canStartField()

    transitions.from(Meaning.FIELD_OPTIONAL).canProvideFieldType()

    transitions.from(Meaning.FIELD_TYPE_PRIMITIVE, Meaning.FIELD_TYPE_CUSTOM)
    .matches(VariableName, (s) => FieldNamed(s.name))

    transitions.from(Meaning.FIELD_NAME).symbolsMean(Meaning.FIELD_END, Symbol.COMMA, Symbol.NEW_LINE)

    transitions.from(Meaning.FIELD_END)
        .canStartField()
        .symbolsMean(Meaning.ENTITY_END, Symbol.CLOSE_BRACKET)

    // console.log(transitions.stateToSymbolMap)
    return transitions.LastMeaningToNextSymbolMap
}


export const SyntaxParser: SyntaxLookup = makeStateMatcher()


