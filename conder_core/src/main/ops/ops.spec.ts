import {
  ow,
  Procedures,
  interpeterTypeFactory,
  AnyInterpreterTypeInstance,
  ServerEnv,
  Var,
  StrongServerEnv,
  AnySchemaInstance,
  schemaFactory,
} from "./index";

import { Test } from "./local_run/utilities";

describe("conduit kernel", () => {
  function kernelTest(
    descr: string,
    test: (server: Test.Server) => Promise<void>,
    envOverride: Partial<StrongServerEnv> = {},
    only?: "only"
  ) {
    const env: StrongServerEnv = {
      PROCEDURES: {},
      STORES: {},
      SCHEMAS: [],
      DEPLOYMENT_NAME: "testdeployment",
    };
    for (const key in envOverride) {
      //@ts-ignore
      env[key] = envOverride[key];
    }
    const tester: jest.It = only ? it.only : it
    tester(
      descr,
      async () => {
        const server = await Test.Server.start(env);
        await test(server);
        server.kill();
      },
      10000
    );
  }

  describe("noop server", () => {
    kernelTest("should be able to do nothing", async () => {});
  });

  describe("procedures", () => {
    kernelTest(
      "invoking a custom noop",
      async (server) => {
        const res = await server.invoke("customNoop");
        expect(res).toEqual(interpeterTypeFactory.None);
      },
      { PROCEDURES: { customNoop: [ow.noop] } }
    );

    kernelTest(
      "destructuring an object",
      async (server) => {
        const res = await server.invoke("destructure");
        expect(res).toEqual("target field");
      },
      {
        PROCEDURES: {
          destructure: [
            ow.instantiate({ f: { o: { o: "target field" } } }),
            ow.extractFields([["f", "o", "o"]]),
            ow.returnStackTop,
          ],
        },
      }
    );

    kernelTest(
      "cannot invoke private functions",
      async server => {
        expect(await server.invoke("echo", "hello")).toBeNull()
      },
      {
        PROCEDURES: {echo: [ow.returnVariable(0)]},
        PRIVATE_PROCEDURES: ["echo"]
      }
    )

    kernelTest(
      "functions can invoke other functions",
      async server => {
        expect(await server.invoke("callsEcho", "hi")).toEqual("hi")
        expect(await server.invoke("callsNoop")).toEqual("hi")
      },
      {
        PROCEDURES: {
          echo: [ow.returnVariable(0)],
          noop: [ow.noop],
          callsEcho: [ow.copyFromHeap(0), ow.invoke({name: "echo", args: 1}), ow.returnStackTop],
          callsNoop: [ow.invoke({name: "noop", args: 0}), ow.instantiate("hi"), ow.returnStackTop]
        },
        PRIVATE_PROCEDURES: ["echo"]
      },
    )
    kernelTest(
      "math",
      async (server) => {
        expect(await server.invoke("plus")).toBe(42);
        expect(await server.invoke("minus")).toBe(-0.5);
        expect(await server.invoke("divide")).toBe(-0.125);
      },
      {
        PROCEDURES: {
          plus: [
            ow.instantiate(1),
            ow.instantiate(41),
            ow.nPlus,
            ow.returnStackTop,
          ],
          minus: [
            ow.instantiate(0.5),
            ow.instantiate(1),
            ow.nMinus,
            ow.returnStackTop,
          ],
          divide: [
            ow.instantiate(-0.5),
            ow.instantiate(4),
            ow.nDivide,
            ow.returnStackTop,
          ],
        },
      }
    );

    kernelTest(
      "deleting on local objects",
      async (server) => {
        expect(
          await server.invoke("delete", {
            l1: { l2: "delete me", other: "hi" },
          })
        ).toMatchInlineSnapshot(`
          Object {
            "l1": Object {
              "other": "hi",
            },
          }
        `);
      },
      {
        PROCEDURES: {
          delete: [
            
            ow.instantiate("l1"),
            ow.instantiate("l2"),
            ow.deleteSavedField({ field_depth: 2, index: 0}),
            ow.returnVariable(0),
          ],
        },
      }
    );
  });

  describe("schema", () => {
    function schemaTest(
      descr: string,
      allowsNone: "can be none" | "must exist",
      invalidInput: AnyInterpreterTypeInstance,
      validInput: AnyInterpreterTypeInstance,
      schema: AnySchemaInstance
    ) {
      kernelTest(
        `schema test: ${descr}`,
        async (server) => {
          if (allowsNone === "must exist") {
            expect(await server.invoke("validateSchema", [null])).toBeFalsy();
          }

          expect(
            await server.invoke("validateSchema", invalidInput)
          ).toBeFalsy();
          expect(
            await server.invoke("validateSchema", validInput)
          ).toBeTruthy();
        },
        {
          PROCEDURES: {
            validateSchema: [
              ow.enforceSchemaOnHeap({ schema: 0, heap_pos: 0 }),
              ow.returnStackTop,
            ],
          },
          SCHEMAS: [schema],
        }
      );
    }

    kernelTest(
      "input args test",
      async (server) => {
        expect(await server.invoke("test", true, 42, 12)).toBeTruthy();
        expect(await server.invoke("test", 42, false, "abc")).toBeFalsy();
      },
      {
        PROCEDURES: {
          test: [
            ow.enforceSchemaInstanceOnHeap({
              heap_pos: 0,
              schema: schemaFactory.bool,
            }),
            ow.enforceSchemaInstanceOnHeap({
              heap_pos: 1,
              schema: schemaFactory.int,
            }),
            ow.enforceSchemaInstanceOnHeap({
              heap_pos: 2,
              schema: schemaFactory.Any,
            }),
            ow.boolAnd,
            ow.boolAnd,
            ow.returnStackTop,
          ],
        },
      }
    );

    schemaTest(
      "boolean",
      "must exist",
      interpeterTypeFactory.double(12),
      interpeterTypeFactory.bool(true),
      schemaFactory.bool
    );
    schemaTest(
      "decimal",
      "must exist",
      interpeterTypeFactory.string("-1"),
      interpeterTypeFactory.double(12.12),
      schemaFactory.double
    );
    schemaTest(
      "decimal vs string",
      "must exist",
      interpeterTypeFactory.string("0.1"),
      interpeterTypeFactory.double(0.1),
      schemaFactory.double
    );
    schemaTest(
      "Optional double but received none",
      "can be none",
      interpeterTypeFactory.bool(true),
      interpeterTypeFactory.None,
      schemaFactory.Optional(schemaFactory.double)
    );
    schemaTest(
      "array is empty",
      "must exist",
      interpeterTypeFactory.None,
      interpeterTypeFactory.Array([]),
      schemaFactory.Array(schemaFactory.int)
    );
    schemaTest(
      "array tail is invalid",
      "must exist",
      interpeterTypeFactory.Array([12, "abc"]),
      interpeterTypeFactory.Array([12]),
      schemaFactory.Array(schemaFactory.int)
    );
    schemaTest(
      "ints may be treated as doubles",
      "must exist",
      interpeterTypeFactory.string("1"),
      interpeterTypeFactory.int(132),
      schemaFactory.double
    );
    schemaTest(
      "doubles may not be treated as ints",
      "must exist",
      interpeterTypeFactory.double(0.1),
      interpeterTypeFactory.int(1.0),
      schemaFactory.int
    );
    schemaTest(
      "Object containing primitives",
      "must exist",
      interpeterTypeFactory.Object({}),
      interpeterTypeFactory.Object({ i: 12, d: 12.12, b: true, s: "hello" }),
      schemaFactory.Object({
        i: schemaFactory.int,
        d: schemaFactory.double,
        b: schemaFactory.bool,
        s: schemaFactory.string,
      })
    );
    schemaTest(
      "Object containing optional field doesn't exist",
      "must exist",
      interpeterTypeFactory.Object({ i: "abc" }),
      interpeterTypeFactory.Object({}),
      schemaFactory.Object({ i: schemaFactory.Optional(schemaFactory.int) })
    );
    // #DuckTyping
    schemaTest(
      "Object containing unspecified field is allowed",
      "must exist",
      interpeterTypeFactory.Object({}),
      interpeterTypeFactory.Object({ i: 12, d: [12, 12] }),
      schemaFactory.Object({ i: schemaFactory.int })
    );

    schemaTest(
      "Object containing optional object",
      "must exist",
      interpeterTypeFactory.None,
      interpeterTypeFactory.Object({
        o: interpeterTypeFactory.Object({ f: 12 }),
      }),
      schemaFactory.Object({
        o: schemaFactory.Object({ f: schemaFactory.int }),
      })
    );
  });
  type bsonType = "object" | "string" | "long" | "array" | "bool" | "double";
  type ObjectReqs = {
    required: string[];
    properties: Record<string, MongoSchema>;
  };
  type MongoSchema =
    | ({ bsonType: "object" } & ObjectReqs)
    | { bsonType: "string" }
    | { bsonType: "long" }
    | { bsonType: "array"; items: MongoSchema }
    | {
        bsonType: [Exclude<bsonType, "object" | "array">];
      }
    | ({
        bsonType: ["object"];
      } & ObjectReqs)
    | { bsonType: "bool" }
    | { bsonType: "double" };

  describe("mongo storage layer", () => {
    function storageTest(
      descr: string,
      params: Pick<StrongServerEnv, Var.STORES | Var.PROCEDURES>,
      test: (server: Test.Server) => Promise<void>,
      only = false
    ) {
      let tester = only ? it.only : it;

      tester(
        descr,
        async () =>
          Test.Mongo.start(params).then((mongo) =>
            Test.Server.start({
              MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
              ...params,
              SCHEMAS: [],
              DEPLOYMENT_NAME: "statefultest",
            })
              .then((server) => test(server).finally(() => server.kill()))
              .finally(() => mongo.kill())
          ),
        15000
      );
    }

    storageTest(
      "should be able to store a document",
      {
        STORES: {
          storeName: schemaFactory.Object({
            int: schemaFactory.int,
            opt: schemaFactory.Optional(
              schemaFactory.Object({
                arr: schemaFactory.Array(
                  schemaFactory.Object({ b: schemaFactory.bool })
                ),
              })
            ),
          }),
        },
        PROCEDURES: {
          testStore: [
            ow.insertFromHeap({ heap_pos: 0, store: "storeName" }),
            ow.getAllFromStore("storeName"),
            ow.returnStackTop,
          ],
        },
      },
      async (server) => {
        const res = await server.invoke(
          "testStore",
          interpeterTypeFactory.Object({
            int: interpeterTypeFactory.int(12),
            opt: interpeterTypeFactory.None,
          })
        );
        expect(res).toMatchInlineSnapshot(`
          Array [
            Object {
              "int": 12,
              "opt": null,
            },
          ]
        `);
      }
    );

    storageTest(
      "should be able to suppress fields in a query",
      {
        STORES: {
          storeName: schemaFactory.Object({
            left: schemaFactory.int,
            right: schemaFactory.int,
          }),
        },
        PROCEDURES: {
          testStore: [
            ow.insertFromHeap({ heap_pos: 0, store: "storeName" }),
            ow.instantiate({}), // Filter for query
            ow.queryStore(["storeName", { right: false }]),
            ow.returnStackTop,
          ],
        },
      },
      async (server) => {
        const res = await server.invoke(
          "testStore",
          interpeterTypeFactory.Object({
            left: interpeterTypeFactory.int(-1),
            right: interpeterTypeFactory.int(1),
          })
        );
        expect(res).toEqual([{ left: -1 }]);
      }
    );
    storageTest(
      "should be able to filter strings in query",
      {
        STORES: {
          strings: schemaFactory.Object({ value: schemaFactory.string }),
        },
        PROCEDURES: {
          insert: [
            ow.instantiate([{ value: "a" }, { value: "b" }]),
            ow.insertFromStack("strings"),
            ow.instantiate(true),
            ow.returnStackTop,
          ],
          getBs: [
            ow.instantiate({ value: "b" }),
            ow.queryStore(["strings", {}]),
            ow.returnStackTop,
          ],
        },
      },
      async (server) => {
        expect(await server.invoke("insert")).toBeTruthy();
        expect(await server.invoke("insert")).toBeTruthy();
        expect(await server.invoke("getBs")).toEqual([
          { value: "b" },
          { value: "b" },
        ]);
      }
    );

    storageTest(
      "should be able to filter numbers in query",
      {
        STORES: {
          nums: schemaFactory.Object({ value: schemaFactory.int }),
        },
        PROCEDURES: {
          insert: [
            ow.instantiate([{ value: 1 }, { value: 2 }]),
            ow.insertFromStack("nums"),
            ow.instantiate(true),
            ow.returnStackTop,
          ],
          getLte: [
            ow.instantiate({ value: { $lte: {} } }),
            ow.copyFromHeap(0),
            ow.setNestedField(["value", "$lte"]),
            ow.queryStore(["nums", {}]),
            ow.returnStackTop,
          ],
        },
      },
      async (server) => {
        expect(await server.invoke("insert")).toBeTruthy();
        expect(await server.invoke("getLte", 2)).toEqual([
          { value: 1 },
          { value: 2 },
        ]);
        expect(await server.invoke("getLte", 1)).toEqual([{ value: 1 }]);
      }
    );

    storageTest(
      "find one",
      {
        STORES: {
          users: schemaFactory.Object({
            email: schemaFactory.string,
            pwd: schemaFactory.string,
          }),
        },
        PROCEDURES: {
          addUser: [
            ow.insertFromHeap({ heap_pos: 0, store: "users" }),
            ow.returnVariable(0),
          ],
          getUser: [
            ow.instantiate({}),
            ow.copyFromHeap(0),
            ow.assignPreviousToField("email"),
            ow.findOneInStore(["users", {}]),
            ow.returnStackTop,
          ],
        },
      },
      async (server) => {
        const user = { email: "a@gmail.com", pwd: "password" };
        expect(await server.invoke("addUser", user)).toBeTruthy();
        expect(await server.invoke("getUser", user.email)).toEqual(user);
        expect(await server.invoke("getUser", "someoneelse")).toBeNull();
      }
    );

    storageTest(
      "should be able to suppress objects in a query",
      {
        STORES: {
          storeName: schemaFactory.Any,
        },
        PROCEDURES: {
          testStore: [
            ow.insertFromHeap({ heap_pos: 0, store: "storeName" }),
            ow.instantiate({}), //filter for query
            ow.queryStore(["storeName", { right: false }]),
            ow.returnStackTop,
          ],
        },
      },
      async (server) => {
        const res = await server.invoke(
          "testStore",
          interpeterTypeFactory.Object({
            left: interpeterTypeFactory.Object({ a: true, b: false }),
            right: interpeterTypeFactory.Object({ c: false }),
          })
        );
        expect(res).toEqual([{ left: { a: true, b: false } }]);
      }
    );

    const insert = [ow.insertFromHeap({ heap_pos: 0, store: "test" })];

    const len = [ow.instantiate({}), ow.storeLen("test"), ow.returnStackTop];
    const STORES = {
      test: schemaFactory.Object({
        data: schemaFactory.string,
      }),
    };

    storageTest(
      "measure global store",
      { STORES, PROCEDURES: { len, insert } },
      async (server) => {
        expect(
          await server.invoke("insert", [{ data: "first" }, { data: "second" }])
        ).toBeNull();
        expect(await server.invoke("len")).toBe(2);
      }
    );

    storageTest("should be able to delete fields an existing document", 
      {
        STORES: {storeName: schemaFactory.Any},
        PROCEDURES: {
          insert: [ow.instantiate([{f1: 1, f2: 2}, {f1: 3, f2: 4}]), ow.insertFromStack("storeName")],
          deletes: [
            ow.instantiate({f1: 1}), 
            ow.deleteOneInStore("storeName"), 
            ow.instantiate({"$unset": {f2: ""}}), // Drop the f2 on the second doc.
            ow.instantiate({f1: 3}), // Query for the drop
            ow.updateOne({store: "storeName", upsert: false}),
            ow.returnStackTop
          ],
          getAll: [
            ow.getAllFromStore("storeName"),
            ow.returnStackTop
          ]
        }
      },
      async server => {
        expect(await server.invoke("insert")).toBeNull()
        expect(await server.invoke("deletes")).toEqual({f1: 3})
        expect(await server.invoke("getAll")).toEqual([{f1: 3}])
      })
  });

  describe("instructions", () => {
    kernelTest(
      "measuring local arrays",
      async (server) => {
        let len = await server.invoke(
          "measure",
          interpeterTypeFactory.Array([0, 1])
        );
        expect(len).toBe(2);
        len = await server.invoke("measure", []);
        expect(len).toBe(0);
      },
      {
        PROCEDURES: {
          measure: [ow.copyFromHeap(0), ow.arrayLen, ow.returnStackTop],
        },
      }
    );

    kernelTest(
      "comparisons",
      async (server) => {
        // Goes in right left order
        const less = await server.invoke("less", [1, 0]);
        const notless = await server.invoke("less", [0, 0]);
        const lessequal = await server.invoke("lesseq", [0, 0]);
        const notlessequal = await server.invoke("lesseq", [0.01, 0.1]);
        const equal = await server.invoke("equal", ["abc", "abc"]);
        const notequal = await server.invoke("notequal", ["abcd", "abc"]);

        expect(less).toBeTruthy();
        expect(notless).toBeFalsy();
        expect(lessequal).toBeTruthy();
        expect(notlessequal).toBeFalsy();
        expect(equal).toBeTruthy();
        expect(notequal).toBeTruthy();
      },
      {
        PROCEDURES: {
          less: [
            ow.copyFromHeap(0),
            ow.flattenArray,
            ow.less,
            ow.returnStackTop,
          ],
          lesseq: [
            ow.copyFromHeap(0),
            ow.flattenArray,
            ow.lesseq,
            ow.returnStackTop,
          ],
          equal: [
            ow.copyFromHeap(0),
            ow.flattenArray,
            ow.equal,
            ow.returnStackTop,
          ],
          notequal: [
            ow.copyFromHeap(0),
            ow.flattenArray,
            ow.equal,
            ow.negatePrev,
            ow.returnStackTop,
          ],
        },
      }
    );

    describe("locks", () => {
      function lockTest(
        test: (server: Test.Server) => Promise<void>,
        envOverride: Partial<StrongServerEnv> = {},
      ): jest.ProvidesCallback {
        const env: StrongServerEnv = {
          PROCEDURES: {},
          STORES: {state: schemaFactory.Any},
          SCHEMAS: [],
          DEPLOYMENT_NAME: "testdeployment",
        };
        for (const key in envOverride) {
          //@ts-ignore
          env[key] = envOverride[key];
        }

        return async (cb) => {
          const deps = [
            Test.Mongo.start(env),
            Test.EtcD.start(),
          ]
          const [mongo, etcd] = (await Promise.all(deps)) as [Test.Mongo, Test.EtcD]
          env.MONGO_CONNECTION_URI = `mongodb://localhost:${mongo.port}`
          env.ETCD_URL = `http://localhost:${etcd.port}`
          const server = await Test.Server.start(env);
          await test(server);
          server.kill();
          etcd.kill()
          mongo.kill()
          cb()
        }
      }
    

      it("locks prevent progress if held elsewhere",
      lockTest(
      
        async server => {

          await server.invoke("unsafeSet", 0)
          expect(await server.invoke("unsafeGet")).toEqual(0)
          const contesting_incr: (() => Promise<void>)[] = []
          const num_iterations = 10
          for (let i = 0; i < num_iterations; i++) {
            contesting_incr.push(() =>  server.invoke("incr"))
          }
          await Promise.all(contesting_incr.map(f => f()))
          // expect(await server.invoke("getAll")).toEqual([])

          expect(await server.invoke("unsafeGet")).toEqual(num_iterations)
        },
        {
          PROCEDURES: {
            // getAll: [
            //   ow.getAllFromStore("state"),
            //   ow.returnStackTop
            // ],
            unsafeSet: [
              ow.instantiate({"$set": {}}),
              ow.instantiate("$set"),
              ow.instantiate("val"),
              ow.copyFromHeap(0),
              ow.setField({field_depth: 2}), // collapse the above into update doc
              ow.instantiate({key: "shared"}), // query doc
              ow.updateOne({store: "state", upsert: true})
            ],
            unsafeGet: [
              ow.getAllFromStore("state"),
              ow.popArray,
              ow.instantiate("val"),
              ow.getField({field_depth: 1}),
              ow.returnStackTop
            ],
            incr: [
              ow.instantiate(0),
              ow.moveStackTopToHeap,
              ow.instantiate("lock_name"),
              ow.lock,
              ow.invoke({name: 'unsafeGet', args: 0}),
              ow.instantiate(1),
              ow.nPlus,
              ow.invoke({name: "unsafeSet", args: 1}),
              ow.instantiate("lock_name"),
              ow.release,
              ow.returnVoid
            ]
          }
        },
      ), 100000)
      
    })
  });
});
