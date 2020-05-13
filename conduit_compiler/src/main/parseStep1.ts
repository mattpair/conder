import { SyntaxState, syntaxRules, Matcher, SyntaxRule, SemanticTokenUnion, OptionalSemanticResult } from './Syntax';
import { Primitives, Keywords, Symbol, Dynamic } from './lexicon';
import { ValidToken, TagType } from './tokenizer';
import { Field } from './parseStep2';

type SyntaxPair = [SyntaxState, SemanticTokenUnion?]

/**
 * SYNTAX ANALYSIS
 */
type ApplicableSyntaxRules = (w: ValidToken, currentState: SyntaxState) => SyntaxPair


function matcherMatches(matcher: Matcher, w: ValidToken): OptionalSemanticResult {

    switch (w.kind) {
        case TagType.Symbol: {
            return matcher.symbols(w.val)
        }

        case TagType.Primitive: {
            return matcher.prims(w.val)
        }

        case TagType.String: {
            return matcher.variable(w.val)
        }

        case TagType.Number: {
            return matcher.number(w.val)
        }
    }
}

class Router {
    readonly matchers: Matcher[]
    constructor(ms: Matcher[]) {
        this.matchers = ms
    }

    tryMatch(w: ValidToken): SyntaxPair {
        // console.log(`searching for w${JSON.stringify(w)} ${JSON.stringify(this, null, 2)}`)
        const match_result = this.matchers.map((m) => matcherMatches(m, w)).find((a) => a !== undefined)
        if (match_result) {
            return match_result
        }

        throw `Failed parsing at ${JSON.stringify(w)}`
    }
}

type RouterLookup =  {
    readonly [S in SyntaxState]?: Router
}


const loadedRules: RouterLookup = syntaxRules.map((next: SyntaxRule) => {
    return {from: next[0], router: new Router(next[1])}
}).reduce((prev: RouterLookup, curr) => {
    const add = {}
    add[curr.from] = curr.router
    return {...prev, ...add}
}, {})

const applicableSyntaxRules: ApplicableSyntaxRules = (curWord: ValidToken, curState: SyntaxState) => {
    const router = loadedRules[curState]
    if (!router) {
        throw `Cannot find a valid state transitioner for ${curState}`
    }
    
    try {
        return router.tryMatch(curWord)
    } catch(e) {
        if (curWord.val !== Symbol.NEW_LINE) {
            throw new Error(`Cannot transition from state: ${SyntaxState[curState]}\n\n ${e}`)
        }
    }
    // Chew up newlines if they don't mean anything.
    return [curState, undefined]
}

export function tagTokens(words: ValidToken[]): SemanticTokenUnion[] {
    let currenctState = SyntaxState.FILE_START
    // console.log(JSON.stringify(words, null, 2))
    return words.map((token: ValidToken) => {
        const s = applicableSyntaxRules(token, currenctState)
        currenctState = s[0]
        return s[1]
    }).filter(a => a !== undefined)
}