import { Classified, LazyClassification, LazyStatelessClassification, StatelessClassification } from './util/classifying';
import { Symbol, Operators, PrimitiveUnion, AnyKeyword, Primitives } from './lexicon';

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
    ENUM_STARTED="ENUM_STARTED",
    ENUM_NAMED="ENUM_NAMED",
    ENUM_OPENED="ENUM_OPENED",
    ENUM_NON_EMPTY_BODY="ENUM_NON_EMPTY_BODY",
    ENUM_ENTRY_STARTED="ENUM_ENTRY_STARTED",
    ENUM_ENTRY_ENDED="ENUM_ENTRY_ENDED",
    IMPORT_STARTED="IMPORT_STARTED",
    IMPORT_STRING_PROVIDED="IMPORT_STRING_PROVIDED",
    IMPORT_AS_STATED="IMPORT_AS_STATED",
}

export enum Meaning {
    MESSAGE_NAME="MESSAGE_NAME",
    MESSAGE_END="MESSAGE_END",
    FIELD_OPTIONAL="FIELD_OPTIONAL",
    FIELD_TYPE_PRIMITIVE="FIELD_TYPE_PRIMITIVE",
    FIELD_TYPE_CUSTOM="FIELD_TYPE_CUSTOM",
    FIELD_NAME="FIELD_NAME",
    FIELD_END="FIELD_END",
    ENUM_NAME="ENUM_NAME",
    ENUM_ENTRY_NAME="ENUM_ENTRY_NAME",
    ENUM_ENTRY_ENDED="ENUM_ENTRY_ENDED",
    ENUM_ENDED="ENUM_ENDED",
    IMPORT_FILE_LOCATION="IMPORT_FILE_LOCATION",
    IMPORT_ALIAS="IMPORT_ALIAS",
}

const FieldTyped = LazyClassification<PrimitiveUnion>(Meaning.FIELD_TYPE_PRIMITIVE)
const FieldNamed = LazyClassification<string>(Meaning.FIELD_NAME)
const MessagedNamed = LazyClassification<string>(Meaning.MESSAGE_NAME)
const EnumNamed = LazyClassification<string>(Meaning.ENUM_NAME)
const EnumEntryNamed = LazyClassification<string>(Meaning.ENUM_ENTRY_NAME)
const FieldTypedCustom = LazyClassification<{from?: string, type: string}>(Meaning.FIELD_TYPE_CUSTOM)
const ImportFileLocation = LazyClassification<string>(Meaning.IMPORT_FILE_LOCATION)
const ImportAlias = LazyClassification<string>(Meaning.IMPORT_ALIAS)

export type SemanticTokenUnion = 
| Classified<Meaning.MESSAGE_END>
| Classified<Meaning.FIELD_END>
| Classified<Meaning.IMPORT_FILE_LOCATION, string>
| Classified<Meaning.IMPORT_ALIAS, string>
| Classified<Meaning.FIELD_TYPE_PRIMITIVE, PrimitiveUnion>
| Classified<Meaning.FIELD_NAME, string>
| Classified<Meaning.MESSAGE_NAME, string>
| Classified<Meaning.FIELD_OPTIONAL>
| Classified<Meaning.ENUM_NAME, string>
| Classified<Meaning.ENUM_ENTRY_NAME, string>
| Classified<Meaning.ENUM_ENTRY_ENDED>
| Classified<Meaning.ENUM_ENDED>
| Classified<Meaning.FIELD_TYPE_CUSTOM, {from?: string, type: string}>

export type SyntaxTransition = [SyntaxState, SemanticTokenUnion?]
export type SymbolMatch = [Symbol, string]

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
const EnumEnded = StatelessClassification(Meaning.ENUM_ENDED)
const EnumFieldEnded = StatelessClassification(Meaning.ENUM_ENTRY_ENDED)

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
            const spl = s[1].split(".")
            return [SyntaxState.FIELD_CUSTOM_TYPE_GIVEN, FieldTypedCustom({from: spl[0], type: spl[1]})]
        })
        this.whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.FIELD_CUSTOM_TYPE_GIVEN, FieldTypedCustom({type: s[1]})])
        
        return this
    }

    canNameMessageField() {
        this.whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.FIELD_NAME_GIVEN, FieldNamed(s[1])])
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
        .whenMatching(Symbol.enum).to(SyntaxState.ENUM_STARTED)
        .whenMatching(Symbol.import).to(SyntaxState.IMPORT_STARTED)

    transitions.from(SyntaxState.IMPORT_STARTED)
        .whenMatching(Symbol.STRING_LITERAL).causes((s: SymbolMatch) => [SyntaxState.IMPORT_STRING_PROVIDED, ImportFileLocation(s[1])])
    transitions.from(SyntaxState.IMPORT_STRING_PROVIDED)
        .whenMatching(Symbol.as).to(SyntaxState.IMPORT_AS_STATED)
    transitions.from(SyntaxState.IMPORT_AS_STATED)
        .whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.FILE_START, ImportAlias(s[1])])
    

    transitions.from(SyntaxState.NEUTRAL_FILE_STATE).whenMatching(Symbol.message)
        .to(SyntaxState.MESSAGE_STARTED_AWAITING_NAME)

    transitions.from(SyntaxState.MESSAGE_STARTED_AWAITING_NAME).whenMatching(Symbol.VARIABLE_NAME)
        .causes((s: SymbolMatch) => [SyntaxState.MESSAGE_NAMED_AWAITING_OPENING, MessagedNamed(s[1])])

    transitions.from(SyntaxState.MESSAGE_NAMED_AWAITING_OPENING).whenMatching(Symbol.OPEN_BRACKET).to(SyntaxState.EMPTY_MESSAGE_BODY)

    transitions.from(SyntaxState.EMPTY_MESSAGE_BODY).canStartField()

    transitions.from(SyntaxState.OPTIONAL_STATED).canProvideFieldType()

    transitions.from(SyntaxState.FIELD_PRIMITIVE_GIVEN).canNameMessageField()

    transitions.from(SyntaxState.FIELD_CUSTOM_TYPE_GIVEN).canNameMessageField()

    transitions.from(SyntaxState.FIELD_NAME_GIVEN).whenMatching(Symbol.COMMA, Symbol.NEW_LINE).indicates(SyntaxState.NEUTRAL_MESSAGE_BODY, FieldEnded)

    transitions.from(SyntaxState.NEUTRAL_MESSAGE_BODY)
        .canStartField()
        .whenMatching(Symbol.CLOSE_BRACKET).indicates(SyntaxState.NEUTRAL_FILE_STATE, MessageEnded)

    transitions.from(SyntaxState.ENUM_STARTED).whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.ENUM_NAMED, EnumNamed(s[1])])
    transitions.from(SyntaxState.ENUM_NAMED).whenMatching(Symbol.OPEN_BRACKET).to(SyntaxState.ENUM_OPENED)
    transitions.from(SyntaxState.ENUM_OPENED).whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.ENUM_ENTRY_STARTED, EnumEntryNamed(s[1])])
    transitions.from(SyntaxState.ENUM_ENTRY_STARTED).whenMatching(Symbol.COMMA, Symbol.NEW_LINE).indicates(SyntaxState.ENUM_NON_EMPTY_BODY, EnumFieldEnded)
    transitions.from(SyntaxState.ENUM_NON_EMPTY_BODY)
        .whenMatching(Symbol.VARIABLE_NAME).causes((s: SymbolMatch) => [SyntaxState.ENUM_ENTRY_STARTED, EnumEntryNamed(s[1])])
        .whenMatching(Symbol.CLOSE_BRACKET).indicates(SyntaxState.NEUTRAL_FILE_STATE, EnumEnded)

    // console.log(transitions.stateToSymbolMap)
    return transitions.stateToSymbolMap
}


export const SyntaxParser: StateMatcher = makeStateMatcher()


