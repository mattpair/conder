/**
 * The goal of this is to check if some code that performs against mongo
 * state can be performed safely.
 * 
 * The algorithm works by calculating what hypothetical locks we would need to execute our work
 * in a thread-safe manner. Since, we can't actually acquire locks, we know if we need locks, 
 * we can't work safely.
 * 
 * This same logic could eventually be used to calculate locks for another storage layer.
 * However, making a general purpose algorithm limits the usefulness and adds unnecessary. 
 * Complexity at this stage.
 */

type MongoActions = {
    // Gets some global state to use locally.
    get: {id: string}, 
    // Mutates some global state with any number of dependencies on other global state.
    // Does not return any data.
    mut: {id: string, usesLatest: string[]}, 
}
type ActionKind = keyof MongoActions
type AnyAction = {
    [K in keyof MongoActions]: {kind: K} & MongoActions[K]
}[keyof MongoActions]


export type ActionSequence = AnyAction[]
export type LockRequirements = Record<string, Map<string, "r" | "w">>

export function calculate_lock_requirements(sequences: Record<string, ActionSequence>): LockRequirements {
    const lockReqs: LockRequirements = {}
    
    Object.keys(sequences).forEach(func => {
        lockReqs[func] = new Map()
        const previousDep = new Set<string>()
        sequences[func].forEach(action => {
            
            switch (action.kind) {
                case "get":
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
                    break

                
                default: 
                    const n: never = action
            }
        })
    })

    return lockReqs
}