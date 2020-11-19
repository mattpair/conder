type Actions = {
    get: {id: string},
    mutation: {id: string, using: string[]},
}
type ActionKind = keyof Actions
type AnyAction = {
    [K in keyof Actions]: {kind: K} & Actions[K]
}[keyof Actions]


export type ActionSequence = AnyAction[]
export type LockRequirements = Record<string, {global: string, kind: "r" | "w"}[]>

export function calculate_lock_requirements(sequences: Record<string, ActionSequence>): LockRequirements {
    const actionAgainstData = new Map<string, Set<ActionKind>>()
    const lockReqs: LockRequirements = {}

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
    
    Object.keys(sequences).forEach(func => {
        lockReqs[func] = []
        const previouslyGot = new Set<string>()
        sequences[func].forEach(action => {
            
            switch (action.kind) {
                case "get":
                    if (previouslyGot.has(action.id)) {
                        if (actionAgainstData.get(action.id).has("mutation")) {
                            lockReqs[func].push({global: action.id, kind: "r"})
                        }
                    } else {
                        previouslyGot.add(action.id)
                    }
                case "mutation":
                    break
                default: 
                    const n: never = action
            }
        })
    })

    return lockReqs
}