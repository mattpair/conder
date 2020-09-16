import * as child_process from "child_process";
import * as fs from "fs";
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
      arg: AnyInterpreterTypeInstance = interpeterTypeFactory.None,
      expectJson = true
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
    // This test is temporary.
    // Just validating I can stand up before moving on to integration testing.
    function sleep(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    child_process.execSync(`docker pull mongo:4.4`);

    it("should be able to store a document", async () => {
      //-e ${Var.MONGO_INITDB_ROOT_USERNAME}=testadmin -e ${Var.MONGO_INITDB_ROOT_PASSWORD}=password
      const child = child_process.exec(`docker run -p 27017:27017 mongo:4.4`);
      // child.stdout.pipe(process.stdout)
      child.stderr.pipe(process.stderr);
      await sleep(5000);
      const client = await mongodb.MongoClient.connect(
        "mongodb://localhost:27017",
        { useUnifiedTopology: true }
      );
      const db = client.db("conduit");
      const store = {
        kind: "HierarchicalStore",
        typeName: "SomeTypeName",
        specName: "specName",
        name: "storeName",
        schema: schemaFactory.Object({
          int: schemaFactory.int,
          opt: schemaFactory.Optional(
            schemaFactory.Object({
              arr: schemaFactory.Array(
                schemaFactory.Object({ b: schemaFactory.bool })
              ),
            })
          ),
        }),
      };
      db.createCollection(store.name);

      const server = await TestServer.start({
        MONGO_CONNECTION_URI: "mongodb://localhost",
        STORES: {
          storeName: store.schema,
        },
        PROCEDURES: {
          testStore: [
            opWriter.insertFromHeap({ heap_pos: 0, store: store.name }),
            opWriter.returnVariable(0),
            opWriter.getAllFromStore("testStore"),
            opWriter.returnStackTop,
          ],
        },
        SCHEMAS: [],
      });
      const res = await server.invoke(
        "testStore",
        interpeterTypeFactory.Object({
          int: interpeterTypeFactory.int(12),
          opt: interpeterTypeFactory.None,
        })
      );
      expect(res).toMatchInlineSnapshot(`
        Object {
          "int": 12,
          "opt": null,
        }
      `);

      server.kill();

      child.kill("SIGTERM");
    }, 15000);
  });
});
