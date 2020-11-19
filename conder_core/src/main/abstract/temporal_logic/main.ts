type Actions = {
    get: {id: string},
    mut: {id: string, usesLatest: string[]}
}
type ActionKind = keyof Actions
type AnyAction = {
    [K in keyof Actions]: {kind: K} & Actions[K]
}[keyof Actions]


export type ActionSequence = AnyAction[]
export type LockRequirements = Record<string, Map<string, "r" | "w">>

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
        lockReqs[func] = new Map()
        const previouslyGot = new Set<string>()
        const previouslyMut = new Set<string>()
        const previousDep = new Set<string>()
        sequences[func].forEach(action => {
            
            switch (action.kind) {
                case "get":
                    if (previouslyMut.has(action.id)) {
                        lockReqs[func].set(action.id, "w")
                    } else if (previouslyGot.has(action.id)) {
                        if (actionAgainstData.get(action.id).has("mut") && !lockReqs[func].has(action.id)) {
                            lockReqs[func].set(action.id, "r")
                        }
                    } else {
                        previouslyGot.add(action.id)
                    }
                    break
                case "mut":
                    if (action.usesLatest.length > 0) {
                        action.usesLatest.forEach(dependency => {
                            const original = lockReqs[func].get(dependency)
                            const dependencyIsSelf = dependency === action.id
                            
                            lockReqs[func].set(
                                dependency,
                                // Never downgrade a lock
                                original === "w" || dependencyIsSelf ? "w" : "r" 
                            )
                            previousDep.add(dependency)
                        })
                    }
                    if (previousDep.has(action.id)) {
                        lockReqs[func].set(action.id, "w")
                    }
                    previouslyMut.add(action.id)
                    break
                default: 
                    const n: never = action
            }
        })
    })

    return lockReqs
}