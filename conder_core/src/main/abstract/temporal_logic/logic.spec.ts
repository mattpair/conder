import { ActionSequence, calculate_lock_requirements } from "./main";

describe("lock calculation", () => {
  it("require a read lock across multiple gets if mutated elsewhere", () => {
    const gets: ActionSequence = [
      { kind: "get", id: "i" },
      { kind: "get", id: "i" },
    ];
    expect(calculate_lock_requirements({ gets })).toEqual({ gets: [] });

    expect(
      calculate_lock_requirements({
        gets,
        sets: [{ kind: "mutation", id: "i", using: [] }],
      })
    ).toMatchInlineSnapshot(`
      Object {
        "gets": Array [
          Object {
            "global": "i",
            "kind": "r",
          },
        ],
        "sets": Array [],
      }
    `);
  });
});
