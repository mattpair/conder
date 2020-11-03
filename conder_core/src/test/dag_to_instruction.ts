
import {Test, schemaFactory, AnyOpInstance} from 'conder_kernel'
import {Node, Return} from '../../index'

describe("basic functionality", () => {
    type DagServer = Record<string, (...arg: any[]) => Promise<any>>
    type DagProcedures = Record<string, Node>
    function testHarness(proc_nodes: DagProcedures, test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
        const PROCEDURES: Record<string, AnyOpInstance[]> = {}
        for (const key in proc_nodes) {
            PROCEDURES[key] = proc_nodes[key].compile
        }

        const STORES = {TEST_STORE: schemaFactory.Object({})}
        return (cb) => Test.Mongo.start({STORES})
            .then(mongo => Test.Server.start({
                    MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
                    SCHEMAS: [],
                    DEPLOYMENT_NAME: "statefultest",
                    PROCEDURES,
                    STORES
                }, "./conder_kernel/")
                .then(server => {
                    const testSurface: DagServer = {}
                    for (const key in PROCEDURES) {
                        testSurface[key] = () => server.invoke(key)
                    }
                    return test(testSurface).finally(() => {
                        cb()
                        server.kill()
                    })
                })
                .finally(() => mongo.kill())
            )
    }


    it("return node returns null", 
        testHarness({
            r: new Return()
        },
        async (server) => {
            const res = await server.r()
            expect(res).toBeNull()
        })
    )
})