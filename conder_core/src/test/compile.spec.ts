
import {Test, schemaFactory, AnyOpInstance} from 'conder_kernel'
import { AnyNode, RootNode } from 'src/main/IR'
import {BaseNodeDefs,PickNode, toOps, FunctionDescription } from '../../index'

type DagServer = Record<string, (...arg: any[]) => Promise<any>>
const TEST_STORE = "test"

function withInputHarness(
    maybeStorage: "requires storage" | "no storage",
    proc_nodes: Record<string, FunctionDescription>,
    test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
    const getStoresAndProcedures = () => {
        const PROCEDURES: Record<string, AnyOpInstance[]> = {}
        for (const key in proc_nodes) {
            const comp = toOps(proc_nodes[key])
            PROCEDURES[key] = comp
        }

        const STORES = {TEST_STORE: schemaFactory.Object({})}
        return {PROCEDURES, STORES}
    }
    if (maybeStorage === "requires storage") {
        return (cb) => {
            const spec = getStoresAndProcedures()
            return Test.Mongo.start({STORES: spec.STORES})
            .then(mongo => Test.Server.start({
                MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
                SCHEMAS: [],
                DEPLOYMENT_NAME: "statefultest",
                ...spec
            }, "./conder_kernel/")
            .then(async server => {
                const testSurface: DagServer = {}
                for (const key in spec.PROCEDURES) {
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
    }
    return (cb) => {
                            
        const spec = getStoresAndProcedures()
        return Test.Server.start({
            SCHEMAS: [],
            DEPLOYMENT_NAME: "statefultest",
            ...spec
        }, "./conder_kernel/")
        .then(async server => {
            const testSurface: DagServer = {}
            for (const key in spec.PROCEDURES) {
                testSurface[key] = (...args) => server.invoke(key, ...args)
            }
            return test(testSurface).then(() => {
                server.kill()
                cb()
            }).catch((e) => {
                server.kill()
                throw e
            })
        })
    }
}

    

function noInputHarness(
    proc_nodes: Record<string, RootNode[]>, 
    test: (server: DagServer) => Promise<void>,
    maybeStorage: Parameters<typeof withInputHarness>[0]="no storage"
    ): jest.ProvidesCallback {
    const PROCEDURES: Record<string, FunctionDescription> = {}
    for (const key in proc_nodes) {
        PROCEDURES[key] = {
            input: [],
            computation: proc_nodes[key]
        }
    }
    
    return withInputHarness(maybeStorage,PROCEDURES, test)
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
                        field_name: [{kind: "String", value: "some_field"}], 
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

    it("can set double nested field",
        noInputHarness({
            r: [{
                    kind: "Save", 
                    index: 0,
                    value: {
                        kind: "Object", 
                        fields: [{
                            kind: "SetField", 
                            field_name: [{kind: "String", value: "nested"}], 
                            value: {
                                kind: "Object", 
                                fields: []
                            }
                        }]
                    }
                },
                {
                    kind: "Update",
                    target: {kind: "Saved", index: 0},
                    operation: {
                        kind: "SetField",
                        field_name: [{kind: "String", value: "nested"}, {kind: "String", value: "inside"}],
                        value: { kind: "String", value: "hello world"}
                    }
                },
                {kind: "Return", value: {kind: "Saved", index: 0}}
            ]
        }, async (server) => {
            expect(await server.r()).toEqual({nested: {inside: "hello world"}})
        })
    )

    it("can get nested field",
        noInputHarness({
            r: [{
                    kind: "Save", 
                    index: 0,
                    value: {
                        kind: "Object", 
                        fields: [{
                            kind: "SetField", 
                            field_name: [{kind: "String", value: "l1"}], 
                            value: {
                                kind: "Object", 
                                fields: []
                            }
                        }]
                    }
                },
                {
                    kind: "Update",
                    target: {kind: "Saved", index: 0},
                    operation: {
                        kind: "SetField",
                        field_name: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                        value: { kind: "String", value: "hello world"}
                    }
                },
                {kind: "Return", value: {
                    kind: "GetField", 
                    field_name: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                    target: {kind: "Saved", index: 0}
                }}
            ]
        }, async (server) => {
            expect(await server.r()).toEqual("hello world")
        })
    )

    function nComp(sign: PickNode<"Comparison">["sign"]): RootNode[] {
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

    function boolAlgTest(sign: PickNode<"BoolAlg">["sign"], left: PickNode<"BoolAlg">["left"], right: PickNode<"BoolAlg">["right"]): RootNode[] {
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
    it("validates input", withInputHarness("no storage",{
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

    it("check if field exists", withInputHarness("no storage",{
        checksField: {
            input: [
                schemaFactory.Any
            ],
            computation: [{
                kind: "Return",
                value: {
                    kind: "FieldExists",
                    field: {kind: "String", value: "test"},
                    value: {kind: "Saved", index: 0}
                }
            }]
        }
    }, async server => {
        expect(await server.checksField({test: "some"})).toBeTruthy()
        expect(await server.checksField({test: null})).toBeFalsy()
        expect(await server.checksField({t: "a"})).toBeFalsy()
    }))
    
})

describe("globals", () => {

    const get: RootNode[] = [
        {
            kind: "Return", 
            value: {
                kind: "GetField", 
                target: {
                    kind: "GlobalObject", 
                    name: TEST_STORE
                },
                field_name: [{
                    kind: "String",
                    value: "l1"
                }]
            }
        }
    ]
    it("getting a non existent key returns null", 
        noInputHarness({
            get,
        }, 
        async server => {
            expect(await server.get()).toBeNull()
        }, 
        "requires storage")
    )

    it("getting a key returns the value",
        noInputHarness({
            get,
            set: [{
                kind: "Update",
                target: {kind: "GlobalObject", name: TEST_STORE},
                operation: {
                    kind: "SetField",
                    field_name: [{kind: "String", value: "l1"}],
                    value: {kind: "Object", fields: [
                        {
                            kind: "SetField", 
                            value: {
                                kind: "Int", value: 42
                            },
                            field_name: [{kind: "String", value: "l2"}]
                        }
                    ]}
                }
            }]
        },
        async server => {
            expect(await server.set()).toBeNull()
            expect(await server.get()).toEqual({l2: 42})

        },
        "requires storage"
        )
    )

    const getNested: RootNode[] = [
        {
            kind: "Return", 
            value: {
                kind: "GetField", 
                target: {
                    kind: "GlobalObject", 
                    name: TEST_STORE
                },
                field_name: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}]
            }
        }
    ]
  
    it("getting a non existent nested field throws an error",
        noInputHarness({getNested},
        async server => {
            await expect(server.getNested()).rejects.toThrowError()
        },
        "requires storage"
        )
    )

    it("setting a nested key on a non existent object throws an error",
        noInputHarness(
            {
                set: [{
                    kind: "Update",
                    target: {kind: "GlobalObject", name: TEST_STORE},
                    operation: {
                        kind: "SetField",
                        field_name: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                        value: {
                            kind: "Int", value: 41
                        }             
                    }
                }],
                get,
                getNested
            },
            async server => {
                await expect(server.set()).rejects.toThrowError()
                await expect(server.getNested()).rejects.toThrowError()
                expect(await server.get()).toBeNull()
            },
            "requires storage"
        )
    
    )
})