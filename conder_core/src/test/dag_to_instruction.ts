
import {Test, schemaFactory, AnyOpInstance} from 'conder_kernel'
import {AnyNode,PickNode, toOps, FunctionDescription } from '../../index'

type DagServer = Record<string, (...arg: any[]) => Promise<any>>

function withInputHarness(proc_nodes: Record<string, FunctionDescription>, test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
    const PROCEDURES: Record<string, AnyOpInstance[]> = {}
    for (const key in proc_nodes) {
        const comp = toOps(proc_nodes[key])
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
                    testSurface[key] = (...args) => server.invoke(key, ...args)
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

function noInputHarness(proc_nodes: Record<string, AnyNode[]>, test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
    const PROCEDURES: Record<string, FunctionDescription> = {}
    for (const key in proc_nodes) {
        PROCEDURES[key] = {
            input: [],
            computation: proc_nodes[key]
        }
    }

    return withInputHarness(PROCEDURES, test)
}



describe("basic functionality", () => {
    

    it("return node returns null", 
        noInputHarness({
            r: [{kind: "Return"}]
        },
        async (server) => {
            const res = await server.r()
            expect(res).toBeNull()
        })
    )

    it("return node with value returns value",
        noInputHarness({
            r: [{
                kind: "Return", 
                value: {
                    kind: "Object", 
                    fields: [{
                        kind: "SetField", 
                        name: "some_field", 
                        value: {
                            kind: "Bool", 
                            value: false
                        }
                    }
                ]}
            }]
        }, async (server) => {
            expect(await server.r()).toEqual({some_field: false})
        })
    )

    function nComp(sign: PickNode<"Comparison">["sign"]): AnyNode[] {
        return [{
            kind: "Return",
            value: {
                kind: "Comparison",
                sign,
                left: {kind: "Int", value: 1},
                right: {kind: "Int", value: 1}
            }
        }]
    }
    it("can compare numbers", 
        noInputHarness({
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

    function boolAlgTest(sign: PickNode<"BoolAlg">["sign"], left: PickNode<"BoolAlg">["left"], right: PickNode<"BoolAlg">["right"]): AnyNode[] {
        return [{
            kind: "Return",
            value: {
                kind: "BoolAlg",
                left,
                right,
                sign
            }
        }]
    }
    it("can handle boolean algebra", 
        noInputHarness({
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

    it("allows if statements", 
        noInputHarness({
            ifTrue: [{
                kind: "If",
                cond: {kind: "Bool", value: true},
                ifTrue: {kind: "Return", value: {kind: "Int", value: 1}}
            }],
            ifFalseNoFinally: [{
                kind: "If",
                cond: {kind: "Bool", value: false},
                ifTrue: {kind: "Return", value: {kind: "Int", value: 1}}
            }],
            ifFalseFinally: [{
                kind: "If",
                cond: {kind: "Bool", value: false},
                ifTrue: {kind: "Return", value: {kind: "Int", value: 1}},
                finally: {kind: "Return", value: {kind: "Int", value: 2}}
            }]
        }, 
            async server => {
                expect(await server.ifTrue()).toBe(1)
                expect(await server.ifFalseNoFinally()).toBeNull()
                expect(await server.ifFalseFinally()).toBe(2)
        })
    )
})

describe("with input", () => {
    it("validates input", withInputHarness({
        accepts3any: {
            input: [
                schemaFactory.Any,
                schemaFactory.Any,
                schemaFactory.Any
            ],
            computation: [{
                kind: "Return",
                value: {
                    kind: "Saved",
                    index: 2
                }
            }]
        }
    }, async server => {
        await expect(server.accepts3any("a", "b", "c", "d")).rejects.toThrowError()
        await expect(server.accepts3any("a", "b",)).rejects.toThrowError()
        expect(await server.accepts3any("a", "b", "c")).toEqual("c")
    }))
    
})