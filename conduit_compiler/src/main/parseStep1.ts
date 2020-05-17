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
    
    throw new Error(`Cannot transition from state: ${SyntaxState[state]}\n\n ${JSON.stringify(hit)}`)
}

type StringCursor = [number, SyntaxState]

export function tagTokens(file: string): SemanticTokenUnion[] {
    let currentCursor: StringCursor = [0, SyntaxState.FILE_START]
    const tokes: SemanticTokenUnion[] = []

    while (currentCursor[0] < file.length) {
        let maybeHit: RegExpExecArray | null = null
        let hit: SymbolMatch | undefined = undefined
        const acceptedSymbols = SyntaxParser[currentCursor[1]].acceptedSymbols

        // console.log(acceptedSymbols, currentCursor)

        for (let r = 0; r < acceptedSymbols.length; ++r) {
            const consideredSymbol: Symbol = acceptedSymbols[r]
            
            // console.log(`SYMBOL: ${consideredSymbol} ${acceptedSymbols[r]} `)

            const regex: RegExp = SymbolToRegex[consideredSymbol]
            // console.log(`CONSIDERING: ${JSON.stringify(regex.source)}`)
            maybeHit = regex.exec(file.slice(currentCursor[0]))
            if (maybeHit !== null && maybeHit.length > 0) {
                // console.log(`HIT ${JSON.stringify(consideredSymbol)}`)
                hit = [consideredSymbol, maybeHit[0]]
                break
            }
        }
        if (hit === undefined) {
            if (/\s/.test(file.substr(currentCursor[0], 1))) {
                currentCursor = [currentCursor[0] + 1, currentCursor[1]]
                continue
            }
            throw new Error(`Could not identify token type at ${JSON.stringify(currentCursor)}
             ${file.slice(currentCursor[0], currentCursor[0] + 10)}
             `)
        }

        
        const s: SyntaxTransition = applicableSyntaxRules(currentCursor[1], hit)
        currentCursor = [currentCursor[0] + hit[1].length, s[0]]
        if (s[1]) {
            tokes.push(s[1])
        }
    }
    return tokes
}