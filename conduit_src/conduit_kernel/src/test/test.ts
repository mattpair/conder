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
  class TestServer {
    private process: child_process.ChildProcess;
    private readonly port: number;
    private static next_port = 8080;
    constructor(env: StrongServerEnv) {
      this.port = TestServer.next_port++;
      const string_env: Partial<ServerEnv> = {};
      for (const key in env) {
        //@ts-ignore
        string_env[key] =
        //@ts-ignore
          typeof env[key] === "string" ? env[key] : JSON.stringify(env[key]);
      }

      this.process = child_process.exec(`./app ${this.port}`, {
        cwd: "./src/rust/target/debug",
        env: string_env,
      });
      this.process.stdout.pipe(process.stdout);
      this.process.stderr.pipe(process.stderr);
    }

    public static async start(env: StrongServerEnv): Promise<TestServer> {
      // portAssignments.set(8080, this.process);
      const ret = new TestServer(env);
      let retry = true;
      while (retry) {
        try {
          await ret.noopRequest();
          retry = false;
        } catch (e) {
          retry = true;
        }
      }
      return ret;
    }

    async noopRequest() {
      const body = JSON.stringify({ kind: "Noop" });
      const res = await fetch(`http://localhost:${this.port}`, {
        method: "PUT",
        body,
        headers: {
          "content-type": "application/json",
          "content-length": `${body.length}`,
        },
      }).then((data) => data.json());

      expect(res).toEqual(interpeterTypeFactory.None);
    }

    kill() {
      this.process.kill("SIGTERM");
    }

    async invoke(
      name: string,
      arg: AnyInterpreterTypeInstance = interpeterTypeFactory.None
    ) {
      const body = JSON.stringify({ kind: "Exec", data: { proc: name, arg } });
      return fetch(`http://localhost:${this.port}/`, {
        method: "PUT",
        body,
        headers: {
          "content-type": "application/json",
          "content-length": `${body.length}`,
        },
      }).then((data) => data.json());
    }
  }

  function kernelTest(
    descr: string,
    test: (server: TestServer) => Promise<void>,
    envOverride: Partial<StrongServerEnv> = {}
  ) {
    const env: StrongServerEnv = { PROCEDURES: {}, STORES: {}, SCHEMAS: [] };
    for (const key in envOverride) {
      //@ts-ignore
      env[key] = envOverride[key];
    }
    it(
      descr,
      async () => {
        const server = await TestServer.start(env);
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
    child_process.execSync(`docker pull mongo:4.4`);

    class TestMongo {
      readonly port: number;
      private static next_port = 27017;
      private constructor() {
        this.port = TestMongo.next_port++;
        child_process.execSync(
          `docker run --rm --name mongo${this.port} -d  --mount type=tmpfs,destination=/data/db -p ${this.port}:27017 mongo:4.4 `
        );
      }

      public static async start(stores: Stores): Promise<TestMongo> {
        const ret = new TestMongo();
        const client = await mongodb.MongoClient.connect(
          `mongodb://localhost:${ret.port}`,
          { useUnifiedTopology: true }
        );
        const db = client.db("conduit");
        Object.keys(stores.STORES).forEach(
          async (k) => await db.createCollection(k)
        );
        await db.listCollections();
        return ret;
      }
      public kill() {
        child_process.execSync(`docker kill mongo${this.port}`);
      }
    }

        // val.mongo.kill();
        // val.server.kill();

    type Stores = Pick<StrongServerEnv, Var.STORES>;

    function storageTest(
      descr: string,
      params: Pick<StrongServerEnv, Var.STORES | Var.PROCEDURES>,
      test: (server: TestServer) => Promise<void>,
      only=false
    ) {
      let tester = only ? it.only : it 
              
        tester(
          descr,
          async () => TestMongo.start(params).then((mongo) =>
              TestServer.start({
                MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
                ...params,
                SCHEMAS: [],
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
      opWriter.copyFromHeap(0),
      opWriter.findOneInStore([{ store: "test" }, { _id: false }]),
      opWriter.returnStackTop,
    ];

    const del = [
      opWriter.copyFromHeap(0),
      opWriter.deleteOneInStore({ store: "test" }),
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

        res = await server.invoke("deref", { _id: -1 });

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
        res = await server.invoke("deref", { _id });
        expect(res).toEqual({ data: "First object" });

        res = await server.invoke("del", { _id });
        expect(res).toBe(true);

        res = await server.invoke("deref", { _id });
        expect(res).toEqual(null);

        res = await server.invoke("del", { _id });
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
            opWriter.createUpdateDoc({ $push: {} }),
            opWriter.instantiate(interpeterTypeFactory.int(42)),
            opWriter.setNestedField(["$push", "a"]),
            opWriter.updateOne("nested"),
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
