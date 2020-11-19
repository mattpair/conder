import { ActionSequence, calculate_lock_requirements, LockRequirements } from "./main";

describe("lock calculation", () => {

    class TestActionSet {
        readonly actions: Record<string, ActionSequence>
        constructor(actions: Record<string, ActionSequence>) {
            this.actions = actions
        }
        expectLocks(expectation: LockRequirements): jest.ProvidesCallback {
            return (cb) => {
                const full_expectations: LockRequirements = {}
                for (const key in this.actions) {
                    // Don't require specifying no locks required.
                    if (key in expectation) {
                        full_expectations[key] = expectation[key]
                    } else {
                        full_expectations[key] = []
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
        givenActions({gets, sets: [{ kind: "mutation", id: "i", usesLatest: [] }]})
        .expectLocks({gets: [{kind: "r", global: "i"}]})
    )

    it("doesn't require a lock if a mutation is independent of any global state",
        givenActions({set: [{kind: "mutation", id: "i", usesLatest: []}]})
        .expectLocks({})
    )

    it("requires a lock if a mutation is dependent on global state", 
        givenActions({set: [{kind: "mutation", id: "i", usesLatest: ["j"]}]})
        .expectLocks({set: [{kind: "r", global: "j"}]})
    )
})
