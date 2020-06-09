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

export type SymbolMatch = [Symbol, {[key: string]: string}]


type MatchFunction = (s: SymbolMatch) => SemanticTokenUnion

export type SymbolMatcher = {
    readonly [S in Symbol]?: MatchFunction
} & {
    acceptedSymbols: Symbol[]
}

export type StateMatcher =  {
    readonly [S in Meaning]?: SymbolMatcher
}

class TransitionBuilder {
    readonly LastMeaningToNextSymbolMap: {[S in Meaning]?: {
        [S in Symbol]?: MatchFunction
    }& {acceptedSymbols: Symbol[]}} = {}

    presentFromMeanings: Meaning[]
    symbols: Symbol[]

    causes(f: (s: SymbolMatch) => SemanticTokenUnion) {
        
        const r = this.symbols.reduce((prev: any, curr) => {
            if (this.presentFromMeanings.some(from => curr in this.LastMeaningToNextSymbolMap[from]) ) {
                throw new Error(`Overwriting symbol rule ${this.presentFromMeanings} ${curr}`)
            }
            prev[curr] = f
            return prev
        }, {})
        this.presentFromMeanings.forEach(from => {
            this.LastMeaningToNextSymbolMap[from] = {...this.LastMeaningToNextSymbolMap[from], ...r}
        })
        return this
    }

    indicates(meaning: Meaning) {
        this.causes((a: any) => ({kind: meaning, val: undefined} as SemanticTokenUnion))
        return this
    }

    whenMatching(...symbols: Symbol[]) {
        this.symbols = symbols
        this.presentFromMeanings.forEach(from => {
            this.LastMeaningToNextSymbolMap[from].acceptedSymbols.push(...symbols)
        })
        
        return this
    }

    // common phrases
    canStartField() {
        this.whenMatching(Symbol.optional).indicates(Meaning.FIELD_OPTIONAL)
        this.canProvideFieldType()
        return this
    }

    canProvideFieldType() {
        this.whenMatching(...Primitives).causes((s: SymbolMatch) => FieldTyped(s[0] as PrimitiveUnion))
        this.whenMatching(Symbol.VARIABLE_MEMBER_ACCESS).causes((s: SymbolMatch) => FieldTypedCustom(s[1] as Unresolved.CustomType))
        this.whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => FieldTypedCustom({type: s[1].val}))
        
        return this
    }

    from(...f: Meaning[]) {
        this.presentFromMeanings = f
        f.forEach(state => {
            if (state in this.LastMeaningToNextSymbolMap) {
                return
            }

            this.LastMeaningToNextSymbolMap[state] = {
                acceptedSymbols: []
            }
        })
        
        return this
    }
}

const SymbolRegexesMaker: () => Record<Symbol, RegExp> = () => {
    const r: Partial<Record<Symbol, RegExp>> = {}
    Operators.forEach(op => {
        r[op] =  new RegExp(`^(?<val>${op})`)
    });

    Primitives.forEach(p => {
        r[p] = new RegExp(`^(?<val>${p})\\s`)
    })

    Keywords.forEach(k => {
        r[k] = new RegExp(`^(?<val>${k})\\s`)
    })

    r[Symbol.CLOSE_BRACKET] = /^(?<val>\s*}\s*)/
    r[Symbol.NUMBER_LITERAL] = new RegExp(/^(?<val>\d+)/)
    r[Symbol.VARIABLE_NAME] =  /^(?<val>[_A-Za-z]+[\w]*)/
    r[Symbol.STRING_LITERAL] = /^'(?<val>.*)'/
    r[Symbol.VARIABLE_MEMBER_ACCESS] = /^(?<from>[_A-Za-z]+[\w]*)\.(?<type>[_A-Za-z]+[\w]*)/
    r[Symbol.IMPORT_WITH_ALIAS] = /^import +'(?<presentDir>\.\/)?(?<location>[\w \.\/]*)' +as +(?<alias>[_A-Za-z]+[\w]*)/
    r[Symbol.ENUM_DECLARATION] = /^\s*enum +(?<name>[a-zA-Z]+) *{\s*/
    r[Symbol.ENUM_MEMBER] = /^(?<name>[a-zA-Z]+)(,|[\s]+)\s*/
    r[Symbol.FUCTION_DECLARATION] = /^function +(?<name>[a-zA-Z_]\w*)\(/
    r[Symbol.MESSAGE_DECLARATION] = /^message +(?<name>[a-zA-Z_]\w*) *{/
    
    return r as Record<Symbol, RegExp>
}

export const SymbolToRegex: Record<Symbol, RegExp> = SymbolRegexesMaker()

function makeStateMatcher(): StateMatcher {

    const transitions  = new TransitionBuilder()

    transitions.from(Meaning.START_OF_FILE, Meaning.ENTITY_END, Meaning.IMPORT)
        .whenMatching(Symbol.MESSAGE_DECLARATION).causes((s: SymbolMatch) => MessagedNamed(s[1].name))
        .whenMatching(Symbol.ENUM_DECLARATION).causes((s: SymbolMatch) => new Enum(s[1].name))
        // .whenMatching(Symbol.FUCTION_DECLARATION).causes((s: SymbolMatch) => [SyntaxState.FUNCTION_NAMED, FunctionNamed(s[1].name)]) 
        .whenMatching(Symbol.IMPORT_WITH_ALIAS).causes((s: SymbolMatch) => Import({
            fromPresentDir: s[1].presentDir !== undefined,
            location: s[1].location,
            alias: s[1].alias 
        }))
            
    transitions.from(Meaning.ENUM_DECLARATION)
    .whenMatching(Symbol.ENUM_MEMBER).causes((s: SymbolMatch) => ({kind: Meaning.ENUM_MEMBER, val: s[1].name}))
    
    transitions.from(Meaning.ENUM_MEMBER)
    .whenMatching(Symbol.ENUM_MEMBER).causes((s: SymbolMatch) => ({kind: Meaning.ENUM_MEMBER, val: s[1].name}))
    .whenMatching(Symbol.CLOSE_BRACKET).indicates(Meaning.ENTITY_END)

    transitions.from(Meaning.MESSAGE_DECLARATION).canStartField()

    transitions.from(Meaning.FIELD_OPTIONAL).canProvideFieldType()

    transitions.from(Meaning.FIELD_TYPE_PRIMITIVE, Meaning.FIELD_TYPE_CUSTOM).whenMatching(Symbol.VARIABLE_NAME)
    .causes((s: SymbolMatch) => FieldNamed(s[1].val))

    transitions.from(Meaning.FIELD_NAME).whenMatching(Symbol.COMMA, Symbol.NEW_LINE).indicates(Meaning.FIELD_END)

    transitions.from(Meaning.FIELD_END)
        .canStartField()
        .whenMatching(Symbol.CLOSE_BRACKET).indicates(Meaning.ENTITY_END)

    // console.log(transitions.stateToSymbolMap)
    return transitions.LastMeaningToNextSymbolMap
}


export const SyntaxParser: StateMatcher = makeStateMatcher()


