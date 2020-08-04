
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