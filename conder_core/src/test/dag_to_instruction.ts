
import {Test, schemaFactory} from 'conder_kernel'
import {Node, to_instruction} from '../../index'

describe("basic functionality", () => {
    const TEST_STORE = "testStore"
    type DagServer = {call: () => Promise<any>}
    function testHarness(node: Node, test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
        const ops = to_instruction(node)
        const STORES = {TEST_STORE: schemaFactory.Object({})}
        return (cb) => {
        
            Test.Mongo.start({STORES})
            .then(mongo => Test.Server.start({
                    MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
                    SCHEMAS: [],
                    DEPLOYMENT_NAME: "statefultest",
                    PROCEDURES: {func: ops},
                    STORES
                }, "./conder_kernel/")
                .then(server => {
                    return test({call: () => server.invoke("func")}).finally(() => {
                        cb()
                        server.kill()
                    })
                })
                .finally(() => mongo.kill())
            )
        }
    }
                
    it("can return a field access", 
        testHarness({
            kind: "select",
            store: TEST_STORE,
            after: {kind: "return"}
        },
        async (server) => {
            const res = await server.call()
            expect(res).toEqual([])
        })
    )
})