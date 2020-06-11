import { Classified, LazyClassification, ClassifiedClass } from './util/classifying';
import { Symbol, PrimitiveUnion, Primitives, Operators, Keywords } from './lexicon';
import { Unresolved, Resolved } from './entities';

export enum Meaning {
    START_OF_FILE="Start of File",
    MESSAGE_DECLARATION="Message declaration",
    ENTITY_END="ENTITY_END",
    FIELD_OPTIONAL="FIELD_OPTIONAL",
    FIELD_TYPE_PRIMITIVE="FIELD_TYPE_PRIMITIVE",
    FIELD_TYPE_CUSTOM="FIELD_TYPE_CUSTOM",
    FIELD_NAME="FIELD_NAME",
    FIELD_END="FIELD_END",
    ENUM_DECLARATION="Enum declaration",
    IMPORT="IMPORT",
    ENUM_MEMBER="Enum member",
    FUNCTION_DECLARATION="Function declaration"
}

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
| Classified<Meaning.FUNCTION_DECLARATION, string>

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
        this.matchesSymbols((s: Symbol) =>({kind: Meaning.FIELD_TYPE_PRIMITIVE, val: s as PrimitiveUnion}), ...Primitives)
        this.matches(/^((?<from>[_A-Za-z]+[\w]*)\.)?(?<type>[_A-Za-z]+[\w]*)/,
        (s: RegexCaptureType) => ({kind: Meaning.FIELD_TYPE_CUSTOM, val: {type: s.type, from: s.from}}))
        
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

    
export const SymbolToRegex: Record<Symbol, RegExp> = regexSymbolPartial as Record<Symbol, RegExp>
export const AnyReservedWord: RegExp = new RegExp(`^(${[...Keywords, ...Primitives].map(s => SymbolToRegex[s].source.slice(1).replace("\\s", "")).join("|")})$`)

export const KeywordProtectionExemptedCaptureGroups = new Set(["presentDir", "location"])

function makeStateMatcher(): SyntaxLookup {

    const transitions  = new TransitionBuilder()

    const VariableName = /^(?<name>[_A-Za-z]+[\w]*)/

    transitions.from(Meaning.START_OF_FILE, Meaning.ENTITY_END, Meaning.IMPORT)
        .matches(/^message +(?<name>[a-zA-Z_]\w*) *{/, (s) => ({kind: Meaning.MESSAGE_DECLARATION, val: s.name}))
        .matches(/^enum +(?<name>[a-zA-Z]+) *{\s*/, (s) => ({kind: Meaning.ENUM_DECLARATION, val: {name: s.name, members: []}}))
        .matches(/^import +'(?<presentDir>\.\/)?(?<location>[\w \.\/]*)' +as +(?<name>[_A-Za-z]+[\w]*)/, (s) => ({kind: Meaning.IMPORT, val: {
            fromPresentDir: s.presentDir !== undefined,
            location: s.location,
            alias: s.name 
        }}))
        .matches(/^function +(?<name>[a-zA-Z_]\w*)\(\)\s*{/, (s) => ({kind: Meaning.FUNCTION_DECLARATION, val: s.name}))
    
        
    transitions.from(Meaning.ENUM_DECLARATION, Meaning.ENUM_MEMBER)
    .matches(/^\s*(?<name>[a-zA-Z]+)(,|[\s]+)\s*/, (s) => ({kind: Meaning.ENUM_MEMBER, val: s.name}))
    
    transitions.from(Meaning.ENUM_MEMBER, Meaning.FIELD_END, Meaning.FUNCTION_DECLARATION)
    .symbolsMean(Meaning.ENTITY_END, Symbol.CLOSE_BRACKET)

    transitions.from(Meaning.MESSAGE_DECLARATION).canStartField()

    transitions.from(Meaning.FIELD_OPTIONAL).canProvideFieldType()

    transitions.from(Meaning.FIELD_TYPE_PRIMITIVE, Meaning.FIELD_TYPE_CUSTOM)
    .matches(VariableName, (s) => ({kind: Meaning.FIELD_NAME, val: s.name}))

    transitions.from(Meaning.FIELD_NAME).symbolsMean(Meaning.FIELD_END, Symbol.COMMA, Symbol.NEW_LINE)

    transitions.from(Meaning.FIELD_END)
        .canStartField()

    // console.log(transitions.stateToSymbolMap)
    return transitions.LastMeaningToNextSymbolMap
}


export const SyntaxParser: SyntaxLookup = makeStateMatcher()


