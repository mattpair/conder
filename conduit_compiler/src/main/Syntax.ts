import { Classified, LazyClassification, StatelessClassification } from './util/classifying';
import { Symbol, PrimitiveUnion, Primitives } from './lexicon';
import { Unresolved, Resolved } from './entities';

export enum SyntaxState {
    FILE_START="FILE_START",
    NEUTRAL_FILE_STATE="NEUTRAL_FILE_STATE",
    MESSAGE_STARTED_AWAITING_NAME="MESSAGE_STARTED_AWAITING_NAME",
    MESSAGE_NAMED_AWAITING_OPENING="MESSAGE_NAMED_AWAITING_OPENING",
    EMPTY_MESSAGE_BODY="EMPTY_MESSAGE_BODY",
    OPTIONAL_STATED="OPTIONAL_STATED",
    FIELD_PRIMITIVE_GIVEN="FIELD_PRIMITIVE_GIVEN",
    FIELD_CUSTOM_TYPE_GIVEN="FIELD_CUSTOM_TYPE_GIVEN",
    FIELD_NAME_GIVEN="FIELD_NAME_GIVEN",
    NEUTRAL_MESSAGE_BODY="NEUTRAL_MESSAGE_BODY",
    ENUM_OPEN="Enum open"
}

export enum Meaning {
    MESSAGE_NAME="MESSAGE_NAME",
    MESSAGE_END="MESSAGE_END",
    FIELD_OPTIONAL="FIELD_OPTIONAL",
    FIELD_TYPE_PRIMITIVE="FIELD_TYPE_PRIMITIVE",
    FIELD_TYPE_CUSTOM="FIELD_TYPE_CUSTOM",
    FIELD_NAME="FIELD_NAME",
    FIELD_END="FIELD_END",
    ENUM_DECLARATION="ENUM",
    IMPORT="IMPORT",
    ENUM_MEMBER="Enum member"
}

const FieldTyped = LazyClassification<PrimitiveUnion>(Meaning.FIELD_TYPE_PRIMITIVE)
const FieldNamed = LazyClassification<string>(Meaning.FIELD_NAME)
const MessagedNamed = LazyClassification<string>(Meaning.MESSAGE_NAME)
const Enum = LazyClassification<Resolved.Enum>(Meaning.ENUM_DECLARATION)
const FieldTypedCustom = LazyClassification<Unresolved.CustomType>(Meaning.FIELD_TYPE_CUSTOM)
const Import = LazyClassification<Unresolved.Import>(Meaning.IMPORT)

export type SemanticTokenUnion = 
| Classified<Meaning.ENUM_DECLARATION, Resolved.Enum>
| Classified<Meaning.ENUM_MEMBER, string>
| Classified<Meaning.MESSAGE_END>
| Classified<Meaning.FIELD_END>
| Classified<Meaning.IMPORT, Unresolved.Import>
| Classified<Meaning.FIELD_TYPE_PRIMITIVE, PrimitiveUnion>
| Classified<Meaning.FIELD_NAME, string>
| Classified<Meaning.MESSAGE_NAME, string>
| Classified<Meaning.FIELD_OPTIONAL>
| Classified<Meaning.FIELD_TYPE_CUSTOM, Unresolved.CustomType>

export type SyntaxTransition = [SyntaxState, SemanticTokenUnion?]
export type SymbolMatch = [Symbol, {[key: string]: string}]


type MatchFunction = (s: SymbolMatch) => SyntaxTransition

export type SymbolMatcher = {
    readonly [S in Symbol]?: MatchFunction
} & {
    acceptedSymbols: Symbol[]
}

export type StateMatcher =  {
    readonly [S in SyntaxState]?: SymbolMatcher
}

const MessageEnded = StatelessClassification(Meaning.MESSAGE_END)
const FieldEnded = StatelessClassification(Meaning.FIELD_END)
const FieldRequired = StatelessClassification(Meaning.FIELD_OPTIONAL)

class TransitionBuilder {
    readonly stateToSymbolMap: {[S in SyntaxState]?: {
        [S in Symbol]?: MatchFunction
    }& {acceptedSymbols: Symbol[]}} = {}

    fromState: SyntaxState
    symbols: Symbol[]

    causes(f: (s: SymbolMatch) => SyntaxTransition) {
        
        const r = this.symbols.reduce((prev: any, curr) => {
            if (curr in this.stateToSymbolMap[this.fromState]) {
                throw new Error(`Overwriting symbol rule ${this.fromState} ${curr}`)
            }
            prev[curr] = f
            return prev
        }, {})

        this.stateToSymbolMap[this.fromState] = {...this.stateToSymbolMap[this.fromState], ...r}
        return this
    }

    indicates(syntaxState: SyntaxState, meaning: Classified<Meaning>) {
        this.causes((a: any) => [syntaxState, meaning])
        return this
    }

    to(s: SyntaxState) {
        this.causes((a: any) => [s, undefined])
        return this
    }

    whenMatching(...symbols: Symbol[]) {
        this.symbols = symbols
        this.stateToSymbolMap[this.fromState].acceptedSymbols.push(...symbols)
        return this
    }

    // common phrases
    canStartField() {
        this.whenMatching(Symbol.optional).indicates(SyntaxState.OPTIONAL_STATED, FieldRequired)
        this.canProvideFieldType()
        return this
    }

    canProvideFieldType() {
        this.whenMatching(...Primitives).causes((s: SymbolMatch) => [SyntaxState.FIELD_PRIMITIVE_GIVEN, FieldTyped(s[0] as PrimitiveUnion)])
        this.whenMatching(Symbol.VARIABLE_MEMBER_ACCESS).causes((s: SymbolMatch) => {
            return [SyntaxState.FIELD_CUSTOM_TYPE_GIVEN, FieldTypedCustom(s[1] as Unresolved.CustomType)]
        })
        this.whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.FIELD_CUSTOM_TYPE_GIVEN, FieldTypedCustom({type: s[1].val})])
        
        return this
    }

    canNameMessageField() {
        this.whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.FIELD_NAME_GIVEN, FieldNamed(s[1].val)])
        return this
    }

    from(f: SyntaxState) {
        this.fromState = f
        this.stateToSymbolMap[f] = {
            acceptedSymbols: []
        }
        return this
    }
}

function makeStateMatcher(): StateMatcher {


    const transitions  = new TransitionBuilder()

    transitions.from(SyntaxState.FILE_START)
        .whenMatching(Symbol.message).to(SyntaxState.MESSAGE_STARTED_AWAITING_NAME)
        .whenMatching(Symbol.ENUM_DECLARATION).causes((s: SymbolMatch) => [SyntaxState.ENUM_OPEN, Enum({name: s[1].name, members: []})])
        .whenMatching(Symbol.IMPORT_WITH_ALIAS).causes((s: SymbolMatch) => [SyntaxState.NEUTRAL_FILE_STATE, Import(s[1] as Unresolved.Import)])
            
    transitions.from(SyntaxState.ENUM_OPEN)
    .whenMatching(Symbol.ENUM_MEMBER).causes((s: SymbolMatch) => [SyntaxState.ENUM_OPEN, {kind: Meaning.ENUM_MEMBER, val: s[1].name} ])
    .whenMatching(Symbol.CLOSE_BRACKET).to(SyntaxState.NEUTRAL_FILE_STATE)

    transitions.from(SyntaxState.NEUTRAL_FILE_STATE)
        .whenMatching(Symbol.message).to(SyntaxState.MESSAGE_STARTED_AWAITING_NAME)
        .whenMatching(Symbol.ENUM_DECLARATION).causes((s: SymbolMatch) => [SyntaxState.ENUM_OPEN, Enum({name: s[1].name, members: []})])


    transitions.from(SyntaxState.MESSAGE_STARTED_AWAITING_NAME).whenMatching(Symbol.VARIABLE_NAME)
        .causes((s: SymbolMatch) => [SyntaxState.MESSAGE_NAMED_AWAITING_OPENING, MessagedNamed(s[1].val)])

    transitions.from(SyntaxState.MESSAGE_NAMED_AWAITING_OPENING).whenMatching(Symbol.OPEN_BRACKET).to(SyntaxState.EMPTY_MESSAGE_BODY)

    transitions.from(SyntaxState.EMPTY_MESSAGE_BODY).canStartField()

    transitions.from(SyntaxState.OPTIONAL_STATED).canProvideFieldType()

    transitions.from(SyntaxState.FIELD_PRIMITIVE_GIVEN).canNameMessageField()

    transitions.from(SyntaxState.FIELD_CUSTOM_TYPE_GIVEN).canNameMessageField()

    transitions.from(SyntaxState.FIELD_NAME_GIVEN).whenMatching(Symbol.COMMA, Symbol.NEW_LINE).indicates(SyntaxState.NEUTRAL_MESSAGE_BODY, FieldEnded)

    transitions.from(SyntaxState.NEUTRAL_MESSAGE_BODY)
        .canStartField()
        .whenMatching(Symbol.CLOSE_BRACKET).indicates(SyntaxState.NEUTRAL_FILE_STATE, MessageEnded)

    // console.log(transitions.stateToSymbolMap)
    return transitions.stateToSymbolMap
}


export const SyntaxParser: StateMatcher = makeStateMatcher()


