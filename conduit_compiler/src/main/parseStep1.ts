import { SemanticTokenUnion, Meaning, SyntaxParser, AnyReservedWord, KeywordProtectionExemptedCaptureGroups } from './Syntax';


type StringCursor = {offset: number, state: Meaning}

export function tagTokens(file: string): SemanticTokenUnion[] {
    let currentCursor: StringCursor = {offset: 0, state: Meaning.START_OF_FILE}
    const tokes: SemanticTokenUnion[] = []

    while (currentCursor.offset < file.length) {
        let maybeHit: SemanticTokenUnion | null = null

        const potentialMatchers = SyntaxParser.get(currentCursor.state)
        const head = file.slice(currentCursor.offset)
        let found = false

        for (let r = 0; r < potentialMatchers.length; ++r) {
            const m = potentialMatchers[r]
            let match: RegExpExecArray | null 
            switch (m.make.kind) {
                case "symbol":
                    match = m.regex.exec(head)
                    if(match !== null && match.length > 0) {
                        maybeHit = m.make.val
                    }
                    break
                case "regex":
                    match = m.regex.exec(head)
                    if (match !== null && match.groups) {
                        for (const captureGroup in match.groups) {
                            if (KeywordProtectionExemptedCaptureGroups.has(captureGroup)) {
                                continue
                            }
                            maybeHit = m.make.val(match.groups)

                            if (AnyReservedWord.test(match.groups[captureGroup])) {
                                throw Error(`${maybeHit.kind} ${captureGroup} must not be equivalent to keyword`)
                            }
                        }
                        

                    }
                    break
            }
            if (maybeHit !== null) {
                found = true
                currentCursor = {offset: currentCursor.offset + match[0].length, state: maybeHit.kind}
                tokes.push(maybeHit)
                break
            }
        }
        if (!found) {
            if (/^\s/.test(head)) {
                currentCursor.offset +=  1
                continue
            }
            throw new Error(`Could not identify token type at ${JSON.stringify(currentCursor)}
             ${file.slice(currentCursor.offset, currentCursor.offset + 10)}
             `)
        }
    }
    return tokes
}