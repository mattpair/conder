


export class FileLocation {
    readonly dir: string
    readonly name: string
    readonly fullname: string

    constructor(f: string) {
        const split = splitFilename(f)
        this.dir = split.dir
        this.name = split.name
        this.fullname = f
    }

}

function splitFilename(filename: string): {dir: string, name: string} {
    const pwdMatch = /^(?<rel>([\w ]*\/)*)/.exec(filename)
    if (pwdMatch !== null && pwdMatch.length > 0) {
        return {dir: pwdMatch[0], name: filename.slice(pwdMatch[0].length)}
    } else {
        return {dir: '', name: filename}
    }
}

export function assertNever(x: never): never {
    throw new Error("Unexpected object: " + JSON.stringify(x, null, 2));
}
