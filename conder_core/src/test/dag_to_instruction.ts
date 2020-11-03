
import {Test, schemaFactory, AnyOpInstance} from 'conder_kernel'
import {AnyNode, compile} from '../../index'

describe("basic functionality", () => {
    type DagServer = Record<string, (...arg: any[]) => Promise<any>>
    type DagProcedures = Record<string, AnyNode>
    function testHarness(proc_nodes: DagProcedures, test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
        const PROCEDURES: Record<string, AnyOpInstance[]> = {}
        for (const key in proc_nodes) {
            const comp = compile(proc_nodes[key])
            PROCEDURES[key] = comp
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
                .then(async server => {
                    const testSurface: DagServer = {}
                    for (const key in PROCEDURES) {
                        testSurface[key] = () => server.invoke(key)
                    }
                    return test(testSurface).then(() => {
                        server.kill()
                        mongo.kill()
                        cb()
                    }).catch((e) => {
                        server.kill()
                        mongo.kill()
                        throw e
                    })
                })
                
            )
    }


    it("return node returns null", 
        testHarness({
            r: {kind: "Return"}
        },
        async (server) => {
            const res = await server.r()
            expect(res).toBeNull()
        })
    )

    it("return node with value returns value",
        testHarness({
            r: {
                kind: "Return", 
                value: {
                    kind: "Object", 
                    fields: [{
                        kind: "Field", 
                        name: "some_field", 
                        value: {
                            kind: "Bool", 
                            value: false
                        }
                    }
                ]}
            }
        }, async (server) => {
            expect(await server.r()).toEqual({some_field: false})
        })
    )
})