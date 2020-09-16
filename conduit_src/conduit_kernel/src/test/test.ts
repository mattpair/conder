import * as child_process from "child_process";
import * as fs from 'fs'
import "isomorphic-fetch";
import { getOpWriter, Procedures, interpeterTypeFactory, AnyInterpreterTypeInstance} from "../../index";
import { Schemas, schemaFactory, SchemaInstance, AnySchemaInstance, CompiledTypes, Lexicon } from "conduit_parser";
import * as mongodb from 'mongodb'
import * as assert from 'assert'

describe("conduit kernel", () => {
    const opWriter = getOpWriter()
    class TestServer {
        private process: child_process.ChildProcess
        private readonly port: number
        private static next_port = 8080
        constructor(procedures: Procedures, schemas: Schemas) {
            this.port = TestServer.next_port++
            this.process = child_process.exec(`./app ${this.port}`, {
                cwd: "./src/rust/target/debug",
                env: {
                    "PROCEDURES": JSON.stringify(procedures),
                    "SCHEMAS": JSON.stringify(schemas)
                },                
              });
            this.process.stdout.pipe(process.stdout)
            this.process.stderr.pipe(process.stderr)
        }
        
        public static async start(procedures: Procedures, schemas: Schemas): Promise<TestServer> {
            // portAssignments.set(8080, this.process);
            const ret = new TestServer(procedures, schemas)
            let retry = true 
            while (retry) {
                try {
                    await ret.noopRequest()
                    retry = false
                } catch (e) {
                    retry = true
                } 
            }
            return ret
        }

        async noopRequest() {
            const body = JSON.stringify({kind: "Noop"})
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
            this.process.kill("SIGTERM")
        }

        async invoke(name: string, arg: AnyInterpreterTypeInstance = interpeterTypeFactory.None) {
            const body = JSON.stringify({kind: "Exec", data: {proc: name, arg}})
            return fetch(`http://localhost:${this.port}/`, {
                method: "PUT",
                body,
                headers: {
                "content-type": "application/json",
                "content-length": `${body.length}`,
                },
            }).then((data) => data.json())
        }
    }

    function kernelTest(descr: string, test: (server: TestServer) => Promise<void>, procs: Procedures ={}, schemas: Schemas=[]) {
        it(descr, async () => {
            const server = await TestServer.start(procs, schemas)
            await test(server)
            server.kill()
        }, 10000)
    }
  
    describe("noop server", () => {
        kernelTest("should be able to do nothing", async () => {});
    })
    
    describe("procedures", () => {
        kernelTest("invoking a custom noop", async (server) => {
            const res = await server.invoke("customNoop")
            expect(res).toEqual(interpeterTypeFactory.None)
        }, {"customNoop": [opWriter.noop]})
    })

    describe("schema", () => {

        function schemaTest(descr: string, allowsNone: "can be none" | "must exist", invalidInput: AnyInterpreterTypeInstance, validInput: AnyInterpreterTypeInstance, schema: AnySchemaInstance) {
            kernelTest(`schema test: ${descr}`, async (server) => {
                let failure = false
                // No input
                if (allowsNone === "must exist") {
                    await server.invoke("validateSchema").catch(() => failure =true)
                    expect(failure).toBe(true)
                    failure = false
                }

                await server.invoke("validateSchema", invalidInput).catch(() => failure = true)
                expect(failure).toBe(true)

                const res = await server.invoke("validateSchema", validInput)
                expect(res).toEqual(validInput)
    
            }, {"validateSchema": [opWriter.enforceSchemaOnHeap({schema: 0, heap_pos: 0}), opWriter.returnVariable(0)]}, [schema])
        }
        
        schemaTest("boolean", "must exist", interpeterTypeFactory.double(12), interpeterTypeFactory.bool(true), schemaFactory.bool)
        schemaTest("decimal", "must exist", interpeterTypeFactory.string("-1"), interpeterTypeFactory.double(12.12), schemaFactory.double)
        schemaTest("decimal vs string", "must exist", interpeterTypeFactory.string("0.1"), interpeterTypeFactory.double(0.1), schemaFactory.double)
        schemaTest("Optional double but received none", "can be none", interpeterTypeFactory.bool(true), interpeterTypeFactory.None, schemaFactory.Optional(schemaFactory.double))
        schemaTest("array is empty", "must exist", interpeterTypeFactory.None, interpeterTypeFactory.Array([]), schemaFactory.Array(schemaFactory.int))
        schemaTest("array tail is invalid", "must exist", interpeterTypeFactory.Array([12, "abc"]), interpeterTypeFactory.Array([12]), schemaFactory.Array(schemaFactory.int))
        schemaTest("ints may be treated as doubles", "must exist", interpeterTypeFactory.string("1"), interpeterTypeFactory.int(132), schemaFactory.double)
        schemaTest("doubles may not be treated as ints", "must exist", interpeterTypeFactory.double(0.1), interpeterTypeFactory.int(1.0), schemaFactory.int)
        schemaTest("Object containing primitives", "must exist", 
            interpeterTypeFactory.Object({}), 
            interpeterTypeFactory.Object({i: 12, d: 12.12, b: true, s: "hello"}),
            schemaFactory.Object({
                i: schemaFactory.int,
                d: schemaFactory.double,
                b: schemaFactory.bool,
                s: schemaFactory.string
            })
        )
        schemaTest("Object containing optional field doesn't exist", "must exist",
            interpeterTypeFactory.Object({i: "abc"}), 
            interpeterTypeFactory.Object({}),
            schemaFactory.Object({i: schemaFactory.Optional(schemaFactory.int)})
        )
        // #DuckTyping
        schemaTest("Object containing unspecified field is allowed", "must exist",
            interpeterTypeFactory.Object({}), 
            interpeterTypeFactory.Object({i: 12, d: [12, 12]}),
            schemaFactory.Object({i: schemaFactory.int})
        )

        schemaTest("Object containing optional object", "must exist", 
            interpeterTypeFactory.None,
            interpeterTypeFactory.Object({o: interpeterTypeFactory.Object({f: 12})}),
            schemaFactory.Object({o: schemaFactory.Object({f: schemaFactory.int})})
        )
    })
    type bsonType = "object" | "string" | "long" | "array" | "bool" | "double"
    type ObjectReqs ={required: string[], properties: Record<string, MongoSchema>}
    type MongoSchema = ({bsonType: "object"} & ObjectReqs) |
    {bsonType: "string"} | {bsonType: "long"} | {bsonType: "array", items: MongoSchema} | {
        bsonType: [Exclude<bsonType, "object" | "array">]
    } | ({
        bsonType: ["object"]
    } & ObjectReqs) | {bsonType: "bool"} | {bsonType: "double"}

    function toMongoSchema(s: AnySchemaInstance): MongoSchema {
        switch(s.kind) {
            case "Array":
                return {
                    bsonType: "array",
                    items: toMongoSchema(s.data[0])
                }
            case "Object":
                const properties: Record<string, MongoSchema> = {}
                const required: string[] = []
                for (const key in s.data) {
                    if (s.data[key].kind === "Optional") {
                        properties[key] = toMongoSchema(s.data[key].data[0])
                    } else {
                        required.push(key)
                        properties[key] = toMongoSchema(s.data[key])
                    }
                    
                }
                return {
                    bsonType: "object",
                    properties,
                    required
                }
            case "Optional":
            case Lexicon.Symbol.double:
                return {bsonType: "double"}
            case Lexicon.Symbol.int:
                return {bsonType: "long"}
            case Lexicon.Symbol.string:
                return {bsonType: "string"}
            case Lexicon.Symbol.bool:
                return {bsonType: "bool"}
        }
    }

    async function setupMongo(s: CompiledTypes.HierarchicalStore): Promise<mongodb.Collection<any>> {
        const client = await mongodb.MongoClient.connect("mongodb://localhost:27017", {numberOfRetries: 15, reconnectInterval: 1000})
        const db = client.db("test")
        
        return await db.createCollection(s.name)
    }
    describe("mongo storage layer", () => {
        // This test is temporary. 
        // Just validating I can stand up before moving on to integration testing.
        function sleep(ms: number) {
            return new Promise(resolve => setTimeout(resolve, ms));
          }
          
        child_process.execSync(`docker pull mongo:4.4`)

        it("should be able to stand up", async () => {
            const child = child_process.exec(`docker run -p 27017:27017 mongo:4.4`)
            // child.stdout.pipe(process.stdout)
            child.stderr.pipe(process.stderr)
            await sleep(3000)
            const client = await setupMongo({
                kind: "HierarchicalStore",
                typeName: "SomeTypeName",
                specName: "specName",
                name: "storeName",
                schema: 
                    schemaFactory.Object({
                        int: schemaFactory.int,
                        opt: schemaFactory.Optional(
                            schemaFactory.Object({
                                arr: schemaFactory.Array(schemaFactory.Object({b: schemaFactory.bool}))
                            })
                        )
                    })  
            })
            
            
            child.kill("SIGTERM")

        }, 10000)
    })
});
