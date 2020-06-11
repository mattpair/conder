import { SemanticTokenUnion, Meaning, SyntaxParser, AnyReservedWord, KeywordProtectionExemptedCaptureGroups } from './Syntax';


type StringCursor = {offset: number, state: Meaning}

export type LabeledToken = {
    readonly rawString: string
    readonly meaning: SemanticTokenUnion
}


function tryGetNextToken(currentState: Meaning, head: string): LabeledToken | undefined {
    const potentialMatchers = SyntaxParser.get(currentState)

    for (let r = 0; r < potentialMatchers.length; ++r) {
        const m = potentialMatchers[r]
        let match: RegExpExecArray | null 
        switch (m.make.kind) {
            case "symbol":
                match = m.regex.exec(head)
                if(match !== null && match.length > 0) {
                    return {meaning: m.make.val, rawString: match[0]}
                }
                break
            case "regex":
                match = m.regex.exec(head)
                if (match !== null && match.groups) {
                    for (const captureGroup in match.groups) {
                        if (KeywordProtectionExemptedCaptureGroups.has(captureGroup)) {
                            continue
                        }
                        let maybeHit = m.make.val(match.groups)

                        if (AnyReservedWord.test(match.groups[captureGroup])) {
                            throw Error(`${maybeHit.kind} ${captureGroup} must not be equivalent to keyword`)
                        }
                        return {meaning: maybeHit, rawString: match[0]}
                    }
                }
                break
        }
    }
}

export function tagTokens(file: string): LabeledToken[] {
    let currentCursor: StringCursor = {offset: 0, state: Meaning.START_OF_FILE}
    const tokes: LabeledToken[] = []

    while (currentCursor.offset < file.length) {
        const head = file.slice(currentCursor.offset)
        const maybeHit: LabeledToken | undefined = tryGetNextToken(currentCursor.state, head)

        if (maybeHit !== undefined) {
            currentCursor = {offset: currentCursor.offset + maybeHit.rawString.length, state: maybeHit.meaning.kind}
            tokes.push(maybeHit)
        } else if (/^\s/.test(head)) {
            currentCursor.offset +=  1
        }
        else {
            throw new Error(`Could not identify token type at ${JSON.stringify(currentCursor)}
             ${file.slice(currentCursor.offset, currentCursor.offset + 10)}
             `)

        }
    }
    return tokes
}