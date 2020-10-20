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
})

