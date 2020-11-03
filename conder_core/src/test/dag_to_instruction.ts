import { PickNode } from './../main/DAG';

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

    function nComp(sign: PickNode<"Comparison">["sign"]): AnyNode {
        return {
            kind: "Return",
            value: {
                kind: "Comparison",
                sign,
                left: {kind: "Int", value: 1},
                right: {kind: "Int", value: 1}
            }
        }   
    }
    it("can compare numbers", 
        testHarness({
            geq: nComp(">="),
            leq: nComp("<="),
            l: nComp("<"),
            g: nComp(">"),
            e: nComp("=="),
            ne: nComp("!="),
        }, async server => {
            expect(await server.leq()).toBeTruthy()
            expect(await server.geq()).toBeTruthy()
            expect(await server.l()).toBeFalsy()
            expect(await server.g()).toBeFalsy()
            expect(await server.e()).toBeTruthy()
            expect(await server.ne()).toBeFalsy()
        })
    )

    function boolAlgTest(sign: PickNode<"BoolAlg">["sign"], left: PickNode<"BoolAlg">["left"], right: PickNode<"BoolAlg">["right"]): AnyNode {
        return {
            kind: "Return",
            value: {
                kind: "BoolAlg",
                left,
                right,
                sign
            }
        }
    }
    it("can handle boolean algebra", 
        testHarness({
            trueNtrue: boolAlgTest("and", {kind: "Bool", value: true}, {kind: "Bool", value: true}),
            falseNtrue: boolAlgTest("and", {kind: "Bool", value: false}, {kind: "Bool", value: true}),
            trueNfalse: boolAlgTest("and", {kind: "Bool", value: true}, {kind: "Bool", value: false}),
            trueOtrue: boolAlgTest("or", {kind: "Bool", value: true}, {kind: "Bool", value: true}),
            falseOtrue: boolAlgTest("or", {kind: "Bool", value: false}, {kind: "Bool", value: true}),
            trueOfalse: boolAlgTest("or", {kind: "Bool", value: true}, {kind: "Bool", value: false}),
            falseOfalse: boolAlgTest("or", {kind: "Bool", value: false}, {kind: "Bool", value: false})

        }, async server => {
            expect(await server.trueNtrue()).toBeTruthy()
            expect(await server.falseNtrue()).toBeFalsy()
            expect(await server.trueNfalse()).toBeFalsy()
            expect(await server.trueOtrue()).toBeTruthy()
            expect(await server.trueOfalse()).toBeTruthy()
            expect(await server.falseOtrue()).toBeTruthy()
            expect(await server.falseOfalse()).toBeFalsy()
        })
    
    )
})