import { ActionSequence, calculate_lock_requirements, LockRequirements } from "./main";

describe("lock calculation", () => {
    function given_actions_expect(actions: Record<string, ActionSequence>, expectation: LockRequirements): jest.ProvidesCallback {
        return (cb) => {
            expect(calculate_lock_requirements(actions)).toEqual(expectation)   
            cb() 
        }
    }
    const gets: ActionSequence = [
        { kind: "get", id: "i" },
        { kind: "get", id: "i" },
    ]

    it("doesn't require a read lock across multiple gets if never mutated", 
        given_actions_expect({gets}, {gets: []}))
    
    it("requires a read lock across gets if mutated",
        given_actions_expect(
            {gets, sets: [{ kind: "mutation", id: "i", using: [] }]}, 
            {gets: [{kind: "r", global: "i"}], sets: []}
            )
    )

})
