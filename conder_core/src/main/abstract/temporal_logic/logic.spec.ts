import { ActionSequence, validate } from "./main";

describe("temporal logic", () => {
  it("allows getting the same piece of data twice if it cannot be mutated", () => {
    const gets: ActionSequence = [
      { kind: "get", id: "i" },
      { kind: "get", id: "i" },
    ];
    expect(validate({ gets })).toEqual([]);

    expect(validate({ gets, sets: [{ kind: "set", id: "i" }] }))
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "func": "gets",
          "msg": "Getting i multiple times while mutated elsewhere",
        },
      ]
    `);
  });
});
