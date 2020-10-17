import { Test } from "conduit_kernel"
import { string_to_environment, SuccessfulCompile,  } from "../../index"


describe("basic functionality", () => {
    function compile(str: string): SuccessfulCompile {
        const env = string_to_environment(str)
        expect(env.kind).toEqual("success")
        return env as SuccessfulCompile
    }
    
    const artifacts = compile(`struct anotherMessage {
        m: string
    }
    notused: Array<anotherMessage> = []

    public function other(s: anotherMessage) anotherMessage {
        return s
    }`) 
    
    let server: Test.Server = undefined
    let mongo: Test.Mongo = undefined
    
    beforeAll(async () => {
        mongo = await Test.Mongo.start(artifacts.env)
        
        server = await Test.Server.start({
            MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
            SCHEMAS: artifacts.env.SCHEMAS,
            DEPLOYMENT_NAME: "statefultest",
            PROCEDURES: artifacts.env.PROCEDURES,
            STORES: artifacts.env.STORES
        }, "node_modules/conduit_kernel/")
    })

    afterAll(() => {
        mongo.kill()
        server.kill()
    })
                
    it("can return a field access", async () => {
        const res = await server.invoke("other", {m: "hello"})
        expect(res).toEqual({m: "hello"})
    })
})

