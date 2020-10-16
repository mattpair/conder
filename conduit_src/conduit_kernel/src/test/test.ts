import * as child_process from "child_process";
import "isomorphic-fetch";
import {
  getOpWriter,
  Procedures,
  interpeterTypeFactory,
  AnyInterpreterTypeInstance,
  ServerEnv,
  Var,
  StrongServerEnv,
  Test
} from "../../index";
import {
  Schemas,
  schemaFactory,
  AnySchemaInstance,
  CompiledTypes,
  Lexicon,
} from "conduit_parser";
import * as mongodb from "mongodb";


describe("conduit kernel", () => {
  const opWriter = getOpWriter();
  
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
      { PROCEDURES: { customNoop: [opWriter.noop] } }
    );

    kernelTest(
      "destructuring an object",
      async (server) => {
        const res = await server.invoke("destructure")
        expect(res).toEqual("target field")
      },
      {PROCEDURES: {destructure: [opWriter.instantiate({f: {o: {o: "target field"}}}), opWriter.extractFields([["f", "o", "o"]]), opWriter.returnStackTop]}}
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
          let failure = false;
          // No input
          if (allowsNone === "must exist") {
            await server.invoke("validateSchema").catch(() => (failure = true));
            expect(failure).toBe(true);
            failure = false;
          }

          await server
            .invoke("validateSchema", invalidInput)
            .catch(() => (failure = true));
          expect(failure).toBe(true);

          const res = await server.invoke("validateSchema", validInput);
          expect(res).toEqual(validInput);
        },
        {
          PROCEDURES: {
            validateSchema: [
              opWriter.enforceSchemaOnHeap({ schema: 0, heap_pos: 0 }),
              opWriter.returnVariable(0),
            ],
          },
          SCHEMAS: [schema],
        }
      );
    }

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
            opWriter.insertFromHeap({ heap_pos: 0, store: "storeName" }),
            opWriter.getAllFromStore("storeName"),
            opWriter.returnStackTop,
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
            opWriter.insertFromHeap({ heap_pos: 0, store: "storeName" }),
            opWriter.queryStore(["storeName", { right: false, _id: false }]),
            opWriter.returnStackTop,
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
            opWriter.insertFromHeap({ heap_pos: 0, store: "storeName" }),
            opWriter.queryStore(["storeName", { right: false, _id: false }]),
            opWriter.returnStackTop,
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
      opWriter.insertFromHeap({ heap_pos: 0, store: "test" }),
      opWriter.returnStackTop,
    ];

    const deref = [
      opWriter.enforceSchemaInstanceOnHeap({heap_pos: 0, schema: schemaFactory.Ref({kind: "Object", data: {}})}),
      opWriter.copyFieldFromHeap({heap_pos: 0, fields: ["address"]}),
      opWriter.copyFieldFromHeap({heap_pos: 0, fields: ["parent"]}),
      opWriter.findOneInStore({select: {_id: false}}),
      opWriter.returnStackTop,
    ];

    const del = [
      opWriter.enforceSchemaInstanceOnHeap({heap_pos: 0, schema: schemaFactory.Ref({kind: "Object", data: {}})}),
      opWriter.copyFieldFromHeap({heap_pos: 0, fields: ["address"]}),      
      opWriter.copyFieldFromHeap({heap_pos: 0, fields: ["parent"]}),
      opWriter.deleteOneInStore,
      opWriter.returnStackTop,
    ];

    const len = [opWriter.storeLen("test"), opWriter.returnStackTop];
    const STORES = {
      test: schemaFactory.Object({
        data: schemaFactory.string,
      }),
    };

    storageTest(
      "should be able to dereference a ref - exists",
      {
        STORES,
        PROCEDURES: {
          insert,
          deref,
        },
      },
      async (server) => {
        let res = await server.invoke(
          "insert",
          interpeterTypeFactory.Array([
            interpeterTypeFactory.Object({
              data: "First object",
            }),
            interpeterTypeFactory.Object({
              data: "Second object",
            }),
          ])
        );
        expect(res.length).toBe(2);
        expect("data" in res[0]).toBe(false)
        
        res = await server.invoke("deref", res[0]);

        expect(res).toEqual({ data: "First object" });
      }
    );

    storageTest(
      "should be able to dereference a ref - does not exist",
      {
        STORES,
        PROCEDURES: {
          insert,
          deref,
        },
      },
      async (server) => {
        let res = await server.invoke(
          "insert",
          interpeterTypeFactory.Array([
            interpeterTypeFactory.Object({
              data: "First object",
            }),
          ])
        );
        expect(res).toBeTruthy()

        res = await server.invoke("deref", {address: { _id: -1 }, parent: "test"});

        expect(res).toEqual(null);
      }
    );

    storageTest(
      "should be able to delete a ref",
      {
        STORES,
        PROCEDURES: {
          insert,
          deref,
          del,
        },
      },
      async (server) => {
        let res = await server.invoke(
          "insert",
          interpeterTypeFactory.Array([
            interpeterTypeFactory.Object({
              data: "First object",
            }),
          ])
        );
        expect(res.length).toBe(1);

        const _id = res[0]._id;
        const ptr = {address: { _id }, parent: "test"}
        res = await server.invoke("deref", ptr);
        expect(res).toEqual({ data: "First object" });

        res = await server.invoke("del", ptr);
        expect(res).toBe(true);

        res = await server.invoke("deref", ptr);
        expect(res).toEqual(null);

        res = await server.invoke("del", ptr);
        expect(res).toBe(false);
      }
    );
    storageTest(
      "refs should be in the order that they are inserted",
      {
        STORES,
        PROCEDURES: {
          insert,
          deref,
        },
      },
      async (server) => {
        const ptrs = await server.invoke(
          "insert",
          [
            {
              data: 0,
            },
            {
              data: 1
            }
          ]
        );
        expect(ptrs.length).toBe(2);
        
        let res = await server.invoke("deref", ptrs[1]);
        expect(res).toEqual({ data: 1 });

        res = await server.invoke("deref", ptrs[0]);
        expect(res).toEqual({data: 0});
      }
    );

    storageTest(
      "measure global store",
      { STORES, PROCEDURES: { len, insert } },
      async (server) => {
        expect(
          (await server.invoke("insert", [{ data: "first" }, { data: "second" }])).length
        ).toBe(2);
        expect(await server.invoke("len")).toBe(2);
      },
    );

    storageTest(
      "appending to nested array",
      {
        STORES: {
          nested: schemaFactory.Object({
            a: schemaFactory.Array(schemaFactory.int),
          }),
        },
        PROCEDURES: {
          insert: [
            opWriter.insertFromHeap({ heap_pos: 0, store: "nested" }),
            opWriter.returnStackTop,
          ],
          get: [
            opWriter.queryStore(["nested", {}]),
            opWriter.popArray,
            opWriter.returnStackTop,
          ],
          appendNested: [
            opWriter.copyFromHeap(0),
            opWriter.extractFields([["parent"], ["address"]]),
            opWriter.createUpdateDoc({ $push: {} }),
            opWriter.instantiate(interpeterTypeFactory.int(42)),
            opWriter.setNestedField(["$push", "a"]),
            opWriter.updateOne,
            opWriter.returnStackTop,
          ],
        },
      },
      async (server) => {
        expect(await server.invoke("insert", { a: [] })).toBeTruthy();
        const first = await server.invoke("get");
        expect(first.a).toEqual([]);
        delete first.a;
        const res = await server.invoke("appendNested", first)
        expect(res.a).toEqual([42])
        const second = await server.invoke("get");
        expect(second.a).toEqual([42]);
        expect(first._id).toEqual(second._id);
      }
    );

    storageTest(
      "querying for an address",
      {
        STORES: {
          objs: schemaFactory.Object({
            a: schemaFactory.int,
          }),
        },
        PROCEDURES: {
          insert: [
            opWriter.insertFromHeap({ heap_pos: 0, store: "objs" }),
            opWriter.returnStackTop,
          ],
          get: [
            opWriter.queryStore(["objs", {a: false}]),
            opWriter.popArray,
            opWriter.returnStackTop,
          ],
          deref: [
            opWriter.enforceSchemaInstanceOnHeap({heap_pos: 0, schema: schemaFactory.Ref({kind: "Object", data: {}})}),
            opWriter.copyFieldFromHeap({heap_pos: 0, fields: ["address"]}),
            opWriter.copyFieldFromHeap({heap_pos: 0, fields: ["parent"]}),
            opWriter.findOneInStore({select: {_id: false}}),
            opWriter.returnStackTop,
          ],
        },
      },
      async (server) => {
        expect(await server.invoke("insert", { a: 42 })).toBeTruthy();
        const ptr = await server.invoke("get");
        const res = await server.invoke("deref", ptr)
        expect(res).toEqual({a: 42})
      }
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
            opWriter.copyFromHeap(0),
            opWriter.arrayLen,
            opWriter.returnStackTop,
          ],
        },
      }
    );
  });
});
