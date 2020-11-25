import { ActionSequence, calculate_lock_requirements, LockRequirements, Mutation } from "./lock_calculation";

describe("lock calculation", () => {

    class TestActionSet {
        private readonly actions: Record<string, ActionSequence>
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
    
    it("doesn't require a read lock across gets if mutated",
        givenActions({gets, sets: [new Mutation("i", [])]})
        .expectLocks({})
    )
    
    it("doesn't require a lock if a mut is independent of any global state",
        givenActions({set: [new Mutation("i", [])]})
        .expectLocks({})
    )
    
    
    // The local view will never be inconsistent.
    // It is a weird use case:
    // g = 1
    // ... do stuff with local state
    // g = 2
    // ... do stuff with local state
    it("doesn't require a lock if a series of mut are independent of any global state",
        givenActions({
            set: [
                new Mutation("i", []),
                new Mutation("i", []),
                new Mutation("j", [])
            ],
        })
        .expectLocks({})
    )

    it("requires a read lock if a mut is dependent on some other global state", 
        givenActions({set: [new Mutation("i", ["j"])]})
        .expectLocks({set: {j: "r"}})
    )
    it("requires a write lock if a mut references itself",
        givenActions({set: [new Mutation("i", ["i"])]})
        .expectLocks({set: {i: "w"}})
    )

    it("doesn't require a write lock if you read a global after writing it",
        givenActions({setGet: [
            new Mutation("i", []),
            {kind: "get", id: "i"}
        ]})
        .expectLocks({})
    )

    it("requires a write lock if a used variable is later mutated", 
        givenActions({setOn2: [
            new Mutation("i", "j"),
            new Mutation("j", [])
        ]}).expectLocks({setOn2: {j: "w"}})
    )
})
