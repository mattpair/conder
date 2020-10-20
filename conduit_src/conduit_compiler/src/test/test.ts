import { Test } from "conduit_kernel"
import { string_to_environment, SuccessfulCompile,  } from "../../index"


describe("basic functionality", () => {
    function compile(str: string): SuccessfulCompile {
        const env = string_to_environment(str)
        expect(env.kind).toEqual("success")
        return env as SuccessfulCompile
    }
    
    
    function testHarness(code: string, test: (server: Test.Server) => Promise<void>): jest.ProvidesCallback {
        const artifacts = compile(code)
        return (cb) => {
            Test.Mongo.start(artifacts.env)
            .then(mongo => Test.Server.start({
                    MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
                    SCHEMAS: artifacts.env.SCHEMAS,
                    DEPLOYMENT_NAME: "statefultest",
                    PROCEDURES: artifacts.env.PROCEDURES,
                    STORES: artifacts.env.STORES
                }, "node_modules/conduit_kernel/")
                .then(server => {
                    return test(server).finally(() => {
                        cb()
                        server.kill()
                    })
                })
                .finally(() => mongo.kill())
            )
        }
    }
                
    it("can return a field access", 
        testHarness(`struct anotherMessage {
            m: string
        }
        notused: Array<anotherMessage> = []

        public function other(s: anotherMessage) anotherMessage {
            return s
        }`, 
        async (server) => {
            const res = await server.invoke("other", {m: "hello"})
            expect(res).toEqual({m: "hello"})
        })
    )

    it("can handle basic storage and functions", 
        testHarness(
            `struct Shout {
                content: string 
            }
            
            public function echo(s: Shout) Shout {
                return s
            }
            
            public function doesNothing(s: Shout) {
                
            }
            
            struct WithOptional {
                content: string 
                maybeNum: Optional<int>
                maybeShout: Optional<Shout>
            }
            
            WithOptionals: Array<WithOptional> = []
            
            public function tryOptional(m: WithOptional) WithOptional {
                return m
            }
            
            public function storeOptionals(m: WithOptional) {
                WithOptionals.append([m])
            }
            
            public function getOptionals() Array<WithOptional> {
                return WithOptionals
            }
            
            ShoutStore: Array<Shout> = []
            
            public function saveShout(s: Shout) {
                ShoutStore.append([s])
            }
            
            public function manyEcho(ss: Array<Shout>) Array<Shout> {
                return ss
            }
            
            public function getSavedShouts() Array<Shout> {
                return ShoutStore
            }
            
            struct ShoutFolder {
                history: Array<Shout>
            }
            
            folders: Array<ShoutFolder> = []
            
            public function internalArrayLen(i: ShoutFolder): int {
                return i.history.len()
            }
            
            public function saveManyShouts(f: ShoutFolder) {
                folders.append([f])
            }
            
            public function getFolders() Array<ShoutFolder> {
                return folders
            }
            `,
            async (server) => {
                // Return input
                const shout = {content: "this is my shout"}
                const result = await server.invoke("echo", shout)
                expect(result).toEqual(shout)

                // Noop function
                expect(await server.invoke("doesNothing", shout)).toBeNull()

                // Saving in arrays 
                expect(await server.invoke("saveShout", shout)).toBeNull()
                expect(await server.invoke("getSavedShouts")).toEqual([shout])

                //Optionals
                const withOptional = {
                    content: "the message contains a number",
                    maybeNum: 32,
                    maybeShout: null as any,
                }
                
                const withoutOptional = {
                    content: "the message doesn't contain a number",
                    maybeNum: null as number,
                    maybeShout: null as null,
                };

                expect(await server.invoke("tryOptional", withOptional)).toEqual(withOptional)
                expect(await server.invoke("tryOptional", withoutOptional)).toEqual(withoutOptional)
                const storedOpt = {
                    content: "the message contains both",
                    maybeNum: 32,
                    maybeShout: { content: "blah" },
                  }
                expect(await server.invoke("storeOptionals", storedOpt)).toBeNull()
                expect(await server.invoke("getOptionals")).toEqual([storedOpt])

                const arr = [{ content: "shout 1" }, { content: "shout 2" }]
                expect(await server.invoke("manyEcho", arr)).toEqual(arr)

                const folder = {
                    history: [{ content: "shout 1" }, { content: "shout 2" }],
                }
                
                expect(await server.invoke("saveManyShouts", folder)).toBeNull()
                expect(await server.invoke("getFolders")).toEqual([folder])
                
            }
        )
    )
})

