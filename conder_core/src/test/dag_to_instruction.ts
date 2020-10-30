
import {Test, schemaFactory, AnyOpInstance} from 'conder_kernel'
import {AnyNode, to_instruction} from '../../index'

describe("basic functionality", () => {
    const TEST_STORE = "testStore"
    type DagServer = Record<string, (...arg: any[]) => Promise<any>>
    type DagProcedures = Record<string,AnyNode>
    function testHarness(proc_nodes: DagProcedures, test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
        const PROCEDURES: Record<string, AnyOpInstance[]> = {}
        for (const key in proc_nodes) {
            PROCEDURES[key] = to_instruction(proc_nodes[key])
        }

        const STORES = {TEST_STORE: schemaFactory.Object({})}
        return (cb) => {
        
            Test.Mongo.start({STORES})
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
    }
    const select: DagProcedures = {
        select:
        {
            kind: "select",
            store: TEST_STORE,
            next: {kind: "return"}
        }
    }

    it("allows selections", 
        testHarness(select,
        async (server) => {
            const res = await server.select()
            expect(res).toEqual([])
        })
    )

    it("allows insertion and selection",
        testHarness({...select, insert: {
            kind: "instance",
            // Must store objects.
            value: {field: 42},
            next: {
                kind: "append",
                store: TEST_STORE
            }
        }}, async (server) => {
            expect(await server.insert()).toBeNull()
            expect(await server.select()).toEqual([{field: 42}])
        })
    
    )
})