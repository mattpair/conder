


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



export type StepDefinition<INPUT, ADDED> = Readonly<{
    stepName: string 
    func: (arg0: INPUT) => Promise<ADDED>
}>

export class Sequence<INPUT extends {}, OUTPUT extends {}> {
    readonly def: StepDefinition<INPUT, OUTPUT>
    
    constructor(def: StepDefinition<INPUT, OUTPUT>) {
        this.def = def
    }

    then<NEXT extends {}>(nextStep: StepDefinition<INPUT & OUTPUT, NEXT>): Sequence<INPUT, INPUT & OUTPUT & NEXT> {
        return new Sequence<INPUT, INPUT & OUTPUT & NEXT>({
            stepName: "",
            func: async (arg0: INPUT) => {
                try {
                    if (this.def.stepName !== "") {
                        console.log(`Running step: ${this.def.stepName}`)
                    }
                    return await this.def.func(arg0).then(async (add: OUTPUT) => {
                        if (nextStep.stepName !== "") {
                            console.log(`Running step: ${nextStep.stepName}`)
                        }
                        const next = await nextStep.func({...arg0, ...add}).catch(err => {
                            console.error(`Failure in step:`, err)
                            process.exit(1)
                        })
                        return {...arg0, ...add, ...next}
                    })
                } catch (e) {
                    console.error(`Failure in step:`, e)
                    process.exit(1)
                }
                
            },
        })

    }

    run(i: INPUT): Promise<OUTPUT> {
        return this.def.func(i)
    }

}