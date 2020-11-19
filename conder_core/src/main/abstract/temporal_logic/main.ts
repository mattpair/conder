type Actions = {
    get: {id: string},
    set: {id: string},
}
type ActionKind = keyof Actions
type AnyAction = {
    [K in keyof Actions]: {kind: K} & Actions[K]
}[keyof Actions]


export type ActionSequence = AnyAction[]
type Error = { msg: string, func: string}

export function validate(sequences: Record<string, ActionSequence>): Error[] {
    const actionAgainstData = new Map<string, Set<ActionKind>>()
    

    Object.values(sequences).forEach(seq => {
        seq.forEach(action => {
            const ops = actionAgainstData.get(action.id)
            if (ops === undefined) {
                actionAgainstData.set(action.id, new Set<ActionKind>([action.kind]))
            } else {
                ops.add(action.kind)
                actionAgainstData.set(action.id, ops)
            }
        })
    })
    const errors: Error[] = []
    Object.keys(sequences).forEach(func => {
        const previouslyGot = new Set<string>()
        sequences[func].forEach(action => {
            
            switch (action.kind) {
                case "get":
                    if (previouslyGot.has(action.id)) {
                        if (actionAgainstData.get(action.id).has("set")) {
                            errors.push({msg: `Getting ${action.id} multiple times while mutated elsewhere`, func})
                        }
                    } else {
                        previouslyGot.add(action.id)
                    }
                case "set":
                    break
                default: 
                    const n: never = action
            }
        })
    })

    return errors
}