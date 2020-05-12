import { Classified, LazyClassification, LazyStatelessClassification } from './util/classifying';
import { Symbol, Keywords, Operators, Primitives, PrimitiveUnion, AnyKeyword } from './lexicon';

export enum SyntaxState {
    FILE_START,
    NEUTRAL_FILE_STATE,
    MESSAGE_STARTED_AWAITING_NAME,
    MESSAGE_NAMED_AWAITING_OPENING,
    EMPTY_MESSAGE_BODY,
    REQUIRED_STATED,
    FIELD_PRIMITIVE_GIVEN,
    FIELD_CUSTOM_TYPE_GIVEN,
    FIELD_NAME_GIVEN,
    NEUTRAL_MESSAGE_BODY,
    ENUM_STARTED,
    ENUM_NAMED,
    ENUM_OPENED,
    ENUM_NON_EMPTY_BODY,
    ENUM_ENTRY_STARTED,
    ENUM_ENTRY_ENDED
}

export enum Meaning {
    MESSAGE_START,
    MESSAGE_NAME,
    MESSAGE_END,

    FIELD_REQUIRED,
    FIELD_TYPE_PRIMITIVE,
    FIELD_TYPE_CUSTOM,
    FIELD_NAME,
    FIELD_END,


    ENUM_NAME,
    ENUM_ENTRY_NAME,
    ENUM_ENTRY_ENDED,
    ENUM_ENDED,
}

const FieldTyped = LazyClassification<PrimitiveUnion>(Meaning.FIELD_TYPE_PRIMITIVE)
const FieldNamed = LazyClassification<string>(Meaning.FIELD_NAME)
const MessagedNamed = LazyClassification<string>(Meaning.MESSAGE_NAME)
const EnumNamed = LazyClassification<string>(Meaning.ENUM_NAME)
const EnumEntryNamed = LazyClassification<string>(Meaning.ENUM_ENTRY_NAME)
const FieldTypedCustom = LazyClassification<string>(Meaning.FIELD_TYPE_CUSTOM)

export type SemanticTokenUnion = Classified<Meaning.MESSAGE_START>
| Classified<Meaning.MESSAGE_END>
| Classified<Meaning.FIELD_END>

| Classified<Meaning.FIELD_TYPE_PRIMITIVE, PrimitiveUnion>
| Classified<Meaning.FIELD_NAME, string>
| Classified<Meaning.MESSAGE_NAME, string>
| Classified<Meaning.FIELD_REQUIRED>
| Classified<Meaning.ENUM_NAME, string>
| Classified<Meaning.ENUM_ENTRY_NAME, string>
| Classified<Meaning.ENUM_ENTRY_ENDED>
| Classified<Meaning.ENUM_ENDED>
| Classified<Meaning.FIELD_TYPE_CUSTOM>

export type OptionalSemanticResult = [SyntaxState, SemanticTokenUnion?] | undefined
type Semantizer<X> = (t: X) => OptionalSemanticResult
type InnerSemantizer<X> = (t: X) => SemanticTokenUnion | undefined

type VariableSemantizer = InnerSemantizer<string>
type NumberSemantizer = InnerSemantizer<number>
type PrimitiveSemantizer = InnerSemantizer<PrimitiveUnion>
type SymbolSemantizer = InnerSemantizer<Symbol>

export type Matcher = {
    readonly variable: Semantizer<string>
    readonly number: Semantizer<number>
    readonly prims: Semantizer<PrimitiveUnion>
    readonly symbols: Semantizer<Symbol>
}

function wrap<T>(s: SyntaxState, i: InnerSemantizer<T>): Semantizer<T> {
    return (t: T) => {
        return [s, i(t)]
    }
}

function wrapSymbols(state: SyntaxState, i: SymbolSemantizer, s: Symbol[]): Semantizer<Symbol> {
    return (t: Symbol) => {
        if (s.includes(t)) {
            return [state, i(t)]
        }
    }
}

class MatcherBuilder {
    variable: Semantizer<string> = (a: any) => undefined
    number: Semantizer<number> = (a: any) => undefined
    prims: Semantizer<PrimitiveUnion>= (a: any) => undefined
    symbols: Semantizer<Symbol>= (a: any) => undefined
    readonly to: SyntaxState

    constructor(s: SyntaxState) {
        this.to = s
    }
    
    onVars(v: VariableSemantizer)  {
        this.variable = wrap(this.to, v)
        return [this]
    }

    onNums(n: NumberSemantizer) {
        this.number = wrap(this.to, n)
        return [this]
    }

    onKeywords(k: AnyKeyword[], s: SymbolSemantizer) {
        this.symbols = wrapSymbols(this.to, s, k)
        return [this]
    }
    onInsignificantKeyword(...k: AnyKeyword[]) {
        this.symbols = wrapSymbols(this.to, (a: any) => undefined, k)
        return [this]
    }

    onOperators(s: SymbolSemantizer) {
        this.symbols = wrapSymbols(this.to, s, Operators)
        return [this]
    }

    onInsignificantSyms(...s: Symbol[]) {
        this.symbols = wrapSymbols(this.to, (a: any) => undefined, s)
        return [this]
    }


    onSyms(ss: SymbolSemantizer, ...s: Symbol[]) {
        this.symbols = wrapSymbols(this.to, ss, s)
        return [this]
    }

    onPrims(p: PrimitiveSemantizer) {
        this.prims = wrap(this.to, p)
        return [this]
    }
}

function transitionsTo(s: SyntaxState) {
    return new MatcherBuilder(s)
}

export type SyntaxRule = [SyntaxState, Matcher[]]

const MessageStarted = LazyStatelessClassification(Meaning.MESSAGE_START)
const MessageEnded = LazyStatelessClassification(Meaning.MESSAGE_END)
const FieldEnded = LazyStatelessClassification(Meaning.FIELD_END)
const FieldRequired = LazyStatelessClassification(Meaning.FIELD_REQUIRED)
const EnumEnded = LazyStatelessClassification(Meaning.ENUM_ENDED)
const EnumFieldEnded = LazyStatelessClassification(Meaning.ENUM_ENTRY_ENDED)


// common phrases:
const canStartField = [
    ...transitionsTo(SyntaxState.FIELD_PRIMITIVE_GIVEN).onPrims(FieldTyped),
    ...transitionsTo(SyntaxState.REQUIRED_STATED).onKeywords([Symbol.required], FieldRequired),
    ...transitionsTo(SyntaxState.FIELD_CUSTOM_TYPE_GIVEN).onVars(FieldTypedCustom)
]

const canProvideFieldType = [
    ...transitionsTo(SyntaxState.FIELD_PRIMITIVE_GIVEN).onPrims(FieldTyped),
    ...transitionsTo(SyntaxState.FIELD_CUSTOM_TYPE_GIVEN).onVars(FieldTypedCustom)
]

const canNameMessageField = transitionsTo(SyntaxState.FIELD_NAME_GIVEN).onVars(FieldNamed)


export const syntaxRules: SyntaxRule[] = [
    // Top level file state
    [SyntaxState.FILE_START, [
        ...transitionsTo(SyntaxState.MESSAGE_STARTED_AWAITING_NAME).onKeywords([Symbol.message], MessageStarted),
        ...transitionsTo(SyntaxState.ENUM_STARTED).onInsignificantKeyword(Symbol.enum)
    ]],
    [SyntaxState.NEUTRAL_FILE_STATE, transitionsTo(SyntaxState.MESSAGE_STARTED_AWAITING_NAME).onKeywords([Symbol.message], MessageStarted)],


    // Message creaation
    [SyntaxState.MESSAGE_STARTED_AWAITING_NAME, transitionsTo(SyntaxState.MESSAGE_NAMED_AWAITING_OPENING).onVars(MessagedNamed)],
    [SyntaxState.MESSAGE_NAMED_AWAITING_OPENING,
         transitionsTo(SyntaxState.EMPTY_MESSAGE_BODY).onInsignificantSyms(Symbol.OPEN_BRACKET)],
    [SyntaxState.EMPTY_MESSAGE_BODY, canStartField],
    [SyntaxState.REQUIRED_STATED, canProvideFieldType],
    // Message field creation
    [SyntaxState.FIELD_PRIMITIVE_GIVEN, canNameMessageField],
    [SyntaxState.FIELD_CUSTOM_TYPE_GIVEN, canNameMessageField],
    [SyntaxState.FIELD_NAME_GIVEN, transitionsTo(SyntaxState.NEUTRAL_MESSAGE_BODY).onSyms(FieldEnded, Symbol.COMMA, Symbol.NEW_LINE)],

    [SyntaxState.NEUTRAL_MESSAGE_BODY, [
        ...canStartField,
        ...transitionsTo(SyntaxState.NEUTRAL_FILE_STATE).onSyms(MessageEnded, Symbol.CLOSE_BRACKET)
    ]],

    // Enum Creation
    [SyntaxState.ENUM_STARTED, transitionsTo(SyntaxState.ENUM_NAMED).onVars(EnumNamed)],
    [SyntaxState.ENUM_NAMED, transitionsTo(SyntaxState.ENUM_OPENED).onInsignificantSyms(Symbol.OPEN_BRACKET)],
    [SyntaxState.ENUM_OPENED, transitionsTo(SyntaxState.ENUM_ENTRY_STARTED).onVars(EnumEntryNamed)],
    [SyntaxState.ENUM_ENTRY_STARTED, transitionsTo(SyntaxState.ENUM_NON_EMPTY_BODY).onSyms(EnumFieldEnded, Symbol.COMMA, Symbol.NEW_LINE)],
    [SyntaxState.ENUM_NON_EMPTY_BODY, [
        ...transitionsTo(SyntaxState.ENUM_ENTRY_STARTED).onVars(EnumEntryNamed),
        ...transitionsTo(SyntaxState.NEUTRAL_FILE_STATE).onSyms(EnumEnded, Symbol.CLOSE_BRACKET)
    ]]
]
