import * as child_process from "child_process";
import {
  ow,
  Procedures,
  interpeterTypeFactory,
  AnyInterpreterTypeInstance,
  ServerEnv,
  Var,
  StrongServerEnv,
  AnySchemaInstance,
  schemaFactory
} from "../../index";

import * as mongodb from "mongodb";
import {Test} from '../main/local_run/utilities'


describe("conduit kernel", () => {
  
  function kernelTest(
    descr: string,
    test: (server: Test.Server) => Promise<void>,
    envOverride: Partial<StrongServerEnv> = {}
  ) {
    const env: StrongServerEnv = { PROCEDURES: {}, STORES: {}, SCHEMAS: [], DEPLOYMENT_NAME: "testdeployment" };
    for (const key in envOverride) {
      //@ts-ignore
      env[key] = envOverride[key];
    }
    it(
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
        const res = await server.invoke("destructure")
        expect(res).toEqual("target field")
      },
      {PROCEDURES: {destructure: [ow.instantiate({f: {o: {o: "target field"}}}), ow.extractFields([["f", "o", "o"]]), ow.returnStackTop]}}
    )
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

          expect(await server
            .invoke("validateSchema", invalidInput)).toBeFalsy()
          expect(await server.invoke("validateSchema", validInput)).toBeTruthy()
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
      async server => {
        expect(await server.invoke("test", true, 42, 12)).toBeTruthy()
        expect(await server.invoke("test", 42, false, "abc")).toBeFalsy()
      },
      {
        PROCEDURES: {
          test: [
            ow.enforceSchemaInstanceOnHeap({heap_pos: 0, schema: schemaFactory.bool}),
            ow.enforceSchemaInstanceOnHeap({heap_pos: 1, schema: schemaFactory.int}),
            ow.enforceSchemaInstanceOnHeap({heap_pos: 2, schema: schemaFactory.Any}),
            ow.boolAnd,
            ow.boolAnd,
            ow.returnStackTop
          ]
        }
      },
    )

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
      only=false
    ) {
      let tester = only ? it.only : it 
              
        tester(
          descr,
          async () => Test.Mongo.start(params).then((mongo) =>
              Test.Server.start({
                MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
                ...params,
                SCHEMAS: [],
                DEPLOYMENT_NAME: "statefultest"
              }).then(server => test(server).finally(() => server.kill()))
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
            ow.queryStore(["storeName", { right: false}]),
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
          strings: schemaFactory.Object({value: schemaFactory.string})
        },
        PROCEDURES: {
          insert: [
            ow.instantiate([{value: "a"}, {value: "b"}]),
            ow.insertFromStack("strings"),
            ow.instantiate(true),
            ow.returnStackTop
          ],
          getBs: [
            ow.instantiate({value: "b"}),
            ow.queryStore(["strings", {}]),
            ow.returnStackTop
          ]
        }
      },
      async (server) => {
        expect(await server.invoke("insert")).toBeTruthy()
        expect(await server.invoke("insert")).toBeTruthy()
        expect(await server.invoke("getBs")).toEqual([{value: "b"}, {value: "b"}])
      }
    )
    
    storageTest(
      "should be able to filter numbers in query",
      {
        STORES: {
          nums: schemaFactory.Object({value: schemaFactory.int})
        },
        PROCEDURES: {
          insert: [
            ow.instantiate([{value: 1}, {value: 2}]),
            ow.insertFromStack("nums"),
            ow.instantiate(true),
            ow.returnStackTop
          ],
          getLte: [
            ow.instantiate({value: {"$lte": {}}}),
            ow.copyFromHeap(0),
            ow.setNestedField(["value", "$lte"]),
            ow.queryStore(["nums", {}]),
            ow.returnStackTop
          ]
        }
      },
      async (server) => {
        expect(await server.invoke("insert")).toBeTruthy()
        expect(await server.invoke("getLte", 2)).toEqual([{value: 1}, {value: 2}])
        expect(await server.invoke("getLte", 1)).toEqual([{value: 1}])
      }
    )

    storageTest(
      "find one",
      {
        STORES: {
          users: schemaFactory.Object({email: schemaFactory.string, pwd: schemaFactory.string})
        },
        PROCEDURES: {
          addUser: [ow.insertFromHeap({heap_pos: 0, store: "users"}), ow.returnVariable(0)],
          getUser: [
            ow.instantiate({}), 
            ow.copyFromHeap(0), 
            ow.assignPreviousToField("email"),
            ow.findOneInStore(["users", {}]),
            ow.returnStackTop
          ]
        }
      },
      async (server) => {
        const user = {email: "a@gmail.com", pwd: "password"}
        expect(await server.invoke("addUser", user)).toBeTruthy()
        expect(await server.invoke("getUser", user.email)).toEqual(user)
        expect(await server.invoke("getUser", "someoneelse")).toBeNull()
      }
    )

    storageTest(
      "should be able to suppress objects in a query",
      {
        STORES: {
          storeName: schemaFactory.Object({
            left: schemaFactory.Object({
              a: schemaFactory.bool,
              b: schemaFactory.bool,
            }),
            right: schemaFactory.Object({ c: schemaFactory.bool }),
          }),
        },
        PROCEDURES: {
          testStore: [
            ow.insertFromHeap({ heap_pos: 0, store: "storeName" }),
            ow.instantiate({}), //filter for query
            ow.queryStore(["storeName", { right: false}]),
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

    const insert = [
      ow.insertFromHeap({ heap_pos: 0, store: "test" }),
    ];

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
      },
    );
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
          measure: [
            ow.copyFromHeap(0),
            ow.arrayLen,
            ow.returnStackTop,
          ],
        },
      }
    );

    kernelTest(
      "comparisons",
      async (server) => {
        const less = await server.invoke(
          "less",
          [0, 1]
        )

        const notless = await server.invoke(
          "less",
          [0, 0]
        )

        const lessequal = await server.invoke(
          "lesseq",
          [0, 0]
        )

        const notlessequal = await server.invoke(
          "lesseq",
          [0.1, 0.01]
        )
        const equal = await server.invoke(
          "equal",
          ["abc", "abc"]
        )

        const notequal = await server.invoke(
          "notequal",
          ["abcd", "abc"]
        )


        expect(less).toBeTruthy()
        expect(notless).toBeFalsy()
        expect(lessequal).toBeTruthy()
        expect(notlessequal).toBeFalsy()
        expect(equal).toBeTruthy()
        expect(notequal).toBeTruthy()
      },
      {
        PROCEDURES: {
          less: [ow.copyFromHeap(0), ow.flattenArray, ow.less, ow.returnStackTop],
          lesseq: [ow.copyFromHeap(0), ow.flattenArray, ow.lesseq, ow.returnStackTop],
          equal: [ow.copyFromHeap(0), ow.flattenArray, ow.equal, ow.returnStackTop],
          notequal: [ow.copyFromHeap(0), ow.flattenArray, ow.equal, ow.negatePrev, ow.returnStackTop]
        }
      }
    )
  });
})
