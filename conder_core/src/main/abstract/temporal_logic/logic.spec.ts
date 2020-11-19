import { ActionSequence, calculate_lock_requirements, LockRequirements } from "./main";

describe("lock calculation", () => {

    class TestActionSet {
        readonly actions: Record<string, ActionSequence>
        constructor(actions: Record<string, ActionSequence>) {
            this.actions = actions
        }
        expectLocks(expectation: Record<string, Record<string, "r" | "w">>): jest.ProvidesCallback {
            return (cb) => {
                const full_expectations: LockRequirements = {}
                for (const key in this.actions) {
                    // Don't require specifying no locks required.
                    if (key in expectation) {
                        full_expectations[key] = new Map(Object.entries(expectation[key]))
                    } else {
                        full_expectations[key] = new Map()
                    }
                }
                expect(calculate_lock_requirements(this.actions)).toEqual(full_expectations)   
                cb()    
            }
        }
    }

    function givenActions(actions: Record<string, ActionSequence>): TestActionSet {
        return new TestActionSet(actions)
    }

    const gets: ActionSequence = [
        { kind: "get", id: "i" },
        { kind: "get", id: "i" },
    ]

    it("doesn't require a read lock across multiple gets if never mutated", 
        givenActions({gets}).expectLocks({}))
    
    it("requires a read lock across gets if mutated",
        givenActions({gets, sets: [{ kind: "mut", id: "i", usesLatest: [] }]})
        .expectLocks({gets: {i: "r"}})
    )

    it("doesn't require a lock if a mut is independent of any global state",
        givenActions({set: [{kind: "mut", id: "i", usesLatest: []}]})
        .expectLocks({})
    )

    it("requires a read lock if a mut is dependent on some other global state", 
        givenActions({set: [{kind: "mut", id: "i", usesLatest: ["j"]}]})
        .expectLocks({set: {j: "r"}})
    )
    it("requires a write lock if a mut references itself",
        givenActions({set: [{kind: "mut", id: "i", usesLatest: ["i"]}]})
        .expectLocks({set: {i: "w"}})
    )

    it("requires a write lock if you read a global after writing it",
        givenActions({setGet: [
            {kind: "mut", id: "i", usesLatest: []},
            {kind: "get", id: "i"}
        ]})
        .expectLocks({setGet: {i: "w"}})
    )

    it("requires a write lock if a used variable is later mutated", 
        givenActions({setOn2: [
            {kind: "mut", id: "i", usesLatest: ["j"]},
            {kind: "mut", id: "j", usesLatest: []}
        ]}).expectLocks({setOn2: {j: "w"}})
    )
})
