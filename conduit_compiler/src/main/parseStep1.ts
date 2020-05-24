import { SyntaxState, SymbolMatcher, SemanticTokenUnion, SyntaxTransition, SymbolMatch, SyntaxParser } from './Syntax';
import { Primitives, Keywords, Symbol, Dynamic, SymbolToRegex } from './lexicon';


/**
 * SYNTAX ANALYSIS
 */

type ApplicableSyntaxRules = (state: SyntaxState, hit: SymbolMatch) => SyntaxTransition

const applicableSyntaxRules: ApplicableSyntaxRules = (state: SyntaxState, hit: SymbolMatch) => {
    const router = SyntaxParser[state]
    if (!router) {
        throw `Cannot find a valid state transitioner for ${state}`
    }
    
    if (router[hit[0]]) {
        return router[hit[0]](hit)
    } 
    
    throw new Error(`Cannot transition from state: ${state}\n\n ${JSON.stringify(hit)}`)
}

type StringCursor = {offset: number, state: SyntaxState}

export function tagTokens(file: string): SemanticTokenUnion[] {
    let currentCursor: StringCursor = {offset: 0, state: SyntaxState.FILE_START}
    const tokes: SemanticTokenUnion[] = []

    while (currentCursor.offset < file.length) {
        let maybeHit: RegExpExecArray | null = null
        let matchLength: number = 0
        let hit: SymbolMatch | undefined = undefined
        const acceptedSymbols = SyntaxParser[currentCursor.state].acceptedSymbols


        for (let r = 0; r < acceptedSymbols.length; ++r) {
            const consideredSymbol: Symbol = acceptedSymbols[r]
            
            const regex: RegExp = SymbolToRegex[consideredSymbol]
            maybeHit = regex.exec(file.slice(currentCursor.offset))
            if (maybeHit !== null && maybeHit.groups) {
                matchLength = maybeHit[0].length
                hit = [consideredSymbol, maybeHit.groups]
                break
            }
        }

        if (hit === undefined) {
            if (/\s/.test(file.substr(currentCursor.offset, 1))) {
                currentCursor.offset +=  1
                continue
            }
            throw new Error(`Could not identify token type at ${JSON.stringify(currentCursor)}
             ${file.slice(currentCursor.offset, currentCursor.offset + 10)}
             `)
        }

        
        const s: SyntaxTransition = applicableSyntaxRules(currentCursor.state, hit)
        currentCursor = {offset: currentCursor.offset + matchLength, state: s[0]}
        if (s[1]) {
            tokes.push(s[1])
        }
    }
    return tokes
}