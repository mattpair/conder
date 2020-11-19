type Actions = {
    get: {id: string},
    set: {id: string}
}
type AnyAction = {
    [K in keyof Actions]: {kind: K} & Actions[K]
}[keyof Actions]


export type ActionSequence = AnyAction[]
export type Result = {kind: "error", message: string} | {kind: "success"}

export function validate(seq: ActionSequence, meanwhile: ReadonlyMap<string, ActionSequence>): Result {

    return {kind: "success"}
}