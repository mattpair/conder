// import * as child_process from 'child_process'
// function testBody(conduit: string) {
//     const manifest = compileFiles({test: () => conduit}, {dependents: {}, project: "test", install: []})
//     return new Utilities.Sequence(deriveSupportedOperations)
//     .then(functionToByteCode)
//     .then(writeRustAndContainerCode)
//     .run({manifest, foreignLookup: new Map(), foreignContainerInstr: []})
// }


test("hello world", async () => {
    // child_process.exec()
})

// function testFailsWhen(description: string, conduit: string) {
//     test(description, async () => {
//         let err = undefined
//         await testBody(conduit).catch(e => {err= e})
//         expect(err).toBeDefined()
//         expect(err).toMatchSnapshot()
//     })
// }

