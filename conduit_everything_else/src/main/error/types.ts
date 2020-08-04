export type Error = {
    readonly isError: true
}

export type StartupError = {
    readonly description: string
} & Error

export function isError<E extends Error>(maybe: E | any): maybe is E {
    return (maybe as Error).isError
}