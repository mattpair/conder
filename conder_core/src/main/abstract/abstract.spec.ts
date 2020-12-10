import { Compiler } from './compilers';
import { MONGO_COMPILER, MONGO_GLOBAL_ABSTRACTION_REMOVAL } from './globals/mongo';

import {Test, schemaFactory, AnyOpInstance} from '../ops/index'
import { AnyNode, RootNode } from 'src/main/abstract/IR'
import {BaseNodeDefs, PickNode, toOps } from '../../../index'
import { MONGO_UNPROVIDED_LOCK_CALCULATOR } from './mongo_logic/main';
import { FunctionData, FunctionDescription } from './function';

type DagServer = Record<string, (...arg: any[]) => Promise<any>>
const TEST_STORE = "test"
const testCompiler: Compiler<RootNode> =  MONGO_GLOBAL_ABSTRACTION_REMOVAL
    .tap((nonAbstractRepresentation) => {
        const locks = MONGO_UNPROVIDED_LOCK_CALCULATOR.run(nonAbstractRepresentation)
        expect(locks).toMatchSnapshot(`Required locks`)
    })
    .then(MONGO_COMPILER)

function withInputHarness(
    maybeStorage: "requires storage" | "no storage",
    proc_nodes: Record<string, FunctionData>,
    test: (server: DagServer) => Promise<void>): jest.ProvidesCallback {
    const getStoresAndProcedures = () => {
        const map = new Map(
            Object.entries(proc_nodes)
            .map(([k, v]) => [k, new FunctionDescription(v)]))
        const compiled = toOps(map, testCompiler)
        const PROCEDURES: Record<string, AnyOpInstance[]> = Object.fromEntries(compiled.entries())
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
            })
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
        })
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
        PROCEDURES[key] = new FunctionDescription({input: [], computation: proc_nodes[key]})
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
                        kind: "Field", 
                        key: {kind: "String", value: "some_field"}, 
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
                    value: {
                        kind: "Object", 
                        fields: [{
                            kind: "Field",
                            key: {kind: "String", value: "nested"}, 
                            value: {
                                kind: "Object", 
                                fields: []
                            }
                        }]
                    }
                },
                {
                    kind: "Update",
                    root: {kind: "Saved", index: 0},
                    level: [{kind: "String", value: "nested"}, {kind: "String", value: "inside"}],
                    operation: { kind: "String", value: "hello world"}
                },
                {kind: "Return", value: {kind: "Saved", index: 0}}
            ]
        }, async (server) => {
            expect(await server.r()).toEqual({nested: {inside: "hello world"}})
        })
    )

    it("allows deleting of fields on local objects",
        withInputHarness(
            "no storage", 
            {
                delete: {
                    input: [schemaFactory.Any], 
                    computation: [
                        {
                            kind: "Update", 
                            root:{kind: "Saved", index: 0},
                            level: [{kind: "String", value: "some_key"}],
                            operation: {kind: "DeleteField"}
                        },
                        {
                            kind: "Return",
                            value: {kind: "Saved", index: 0}
                        }
                    ]}},
            async server => {
                expect(await server.delete({some_key: false, other: true})).toEqual({other: true})
                expect(await server.delete({})).toEqual({})
            }
        )
    )

    it("allows gathering of keys on objects",
            withInputHarness(
                "no storage",
                {
                    getKeys: {
                        input: [schemaFactory.Object({
                            a: schemaFactory.Any
                        })],
                        computation: [
                            {kind: "Return", value: {kind: "Selection", root: {kind: "Saved", index: 0}, level: [{kind: "Keys"}]}}
                        ]
                    }
                },
                async server => {
                    expect(await server.getKeys({a: "yada yada"})).toEqual(["a"])
                }
            )
    )

    it("allows directly indexing into object keys",
            withInputHarness(
                "no storage",
                {
                    getKeys: {
                        input: [schemaFactory.Object({
                            a: schemaFactory.Any
                        })],
                        computation: [
                            {kind: "Return", value: {kind: "Selection", root: {kind: "Saved", index: 0}, level: [{kind: "Keys"}, {kind: "Int", value: 0}]}}
                        ]
                    }
                },
                async server => {
                    expect(await server.getKeys({a: "yada yada"})).toEqual("a")
                }
            )
    )

    it("allows deleting of nested fields on locals",
        withInputHarness(
            "no storage", 
            {
                delete: {
                    input: [schemaFactory.Any], 
                    computation: [
                        {
                            kind: "Update", 
                            root: {kind: "Saved", index: 0},
                            level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                            operation: {kind: "DeleteField"}
                        },
                        {
                            kind: "Return",
                            value: {kind: "Saved", index: 0}
                        }
                    ]}},
            async server => {
                expect(await server.delete({l1: {l2: false, other: true}})).toEqual({l1: {other: true}})
                expect(await server.delete({l1: {}})).toEqual({l1: {}})
            }
        )
    )

    it("can get nested field",
        noInputHarness({
            r: [{
                    kind: "Save", 
                    value: {
                        kind: "Object", 
                        fields: [{
                            kind: "Field", 
                            key: {kind: "String", value: "l1"}, 
                            value: {
                                kind: "Object", 
                                fields: []
                            }
                        }]
                    }
                },
                {
                    kind: "Update",
                    root: {kind: "Saved", index: 0},
                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                    operation: { kind: "String", value: "hello world"}
                },
                {kind: "Return", value: {
                    kind: "Selection", 
                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                    root: {kind: "Saved", index: 0}
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

    it("supports basic math",
        noInputHarness({
            minus: [{kind: "Return", value: {
                kind: "Math",
                left: {kind: "Int", value: 42},
                right: {kind: "Int", value: -42},
                sign: "-"
            }}]
        }, async server => {
            expect(await server.minus()).toBe(84)
        })
    
    )

    it("allows if statements", 
        noInputHarness({
            ifTrue: [{
                kind: "If",
                conditionally: [
                    {
                        kind: "Conditional", 
                        cond: {kind: "Bool", value: true},
                        do: [{kind: "Return", value: {kind: "Int", value: 1}}]
                    }
                ]
            }],
            ifFalseNoFinally: [{
                kind: "If",
                conditionally: [
                    {
                        kind: "Conditional", 
                        cond: {kind: "Bool", value: false}, 
                        do: [{kind: "Return", value: {kind: "Int", value: 1}}]
                    },
                ]
            }],
            ifFalseFinally: [{
                kind: "If",
                conditionally: [
                    {kind: "Conditional", cond: {kind: "Bool", value: false}, do: [{kind: "Return"}]},
                    {kind: "Finally", do: [{kind: "Return", value: {kind: "Int", value: 2}}]}
                ]
            }]
        }, 
            async server => {
                expect(await server.ifTrue()).toBe(1)
                expect(await server.ifFalseNoFinally()).toBeNull()
                expect(await server.ifFalseFinally()).toBe(2)
        })
    )

    it("allows elses", 
        noInputHarness({
            else: [{
                kind: "If",
                conditionally: [
                    {kind: "Conditional", cond: {kind: "Bool", value: false}, do: [{kind: "Return"}]},
                    {kind: "Else", do: [{kind: "Return", value: {kind: "Int", value: 42}}]}
                ]
            }] 
        },
        async server => {
            expect(await server.else()).toBe(42)
        })
    )

    it("allows else ifs", 
        noInputHarness({
            elseIfs: [{
                kind: "If",
                conditionally: [
                    {kind: "Conditional", cond: {kind: "Bool", value: false}, do: [{kind: "Return"}]},
                    {kind: "Conditional", cond:  {kind: "Bool", value: false}, do: [{kind: "Return"}]},
                    {kind: "Conditional", cond: {kind: "Bool", value: true}, do: [{kind: "Return", value: {kind: "Int", value: 42}}]}
                ]
            }] 
        },
        async server => {
            expect(await server.elseIfs()).toBe(42)
        })
    )

    it("cleans up after ifs", noInputHarness({
        ifVars: [
            {
                kind: "If",
                conditionally: [
                    {kind: "Conditional", 
                    cond: {kind: "Bool", value: true}, 
                    do: [{kind: "Save", value: {kind: "Int", value: -1}}]},
                ]
            },
            {
                kind: "Save",
                value: {kind: "Int", value: 2}
            },
            {
                kind: "Return", value: {kind: "Saved", index: 0}
            }
    ] 
    },
    async server => {
        expect(await server.ifVars()).toBe(2)
    })
    )

    it("cleans up after for eachs", noInputHarness({
        forVars: [
            {
                kind: "ArrayForEach",
                target: {kind: "ArrayLiteral", values: [{kind: "Bool", value: true}]},
                do: [{kind: "Save", value: {kind: "Int", value: -1}}],
            },
            {
                kind: "Save",
                value: {kind: "Int", value: 2}
            },
            {
                kind: "Return", value: {kind: "Saved", index: 0}
            }
    ] 
    },
    async server => {
        expect(await server.forVars()).toBe(2)
    })
    )

    it("allows pushing to local arrays", withInputHarness(
        "no storage",
        {
            push: {
                input: [schemaFactory.Array(schemaFactory.Any)],
                computation: [
                    {
                        kind: "Update",
                        root: {kind: "Saved", index: 0},
                        level: [],
                        operation: {
                            kind: "Push", 
                            values: [
                                {kind: "String", value: "hello"},
                                {kind: "Int", value: 12}
                            ]
                        }
                    },
                    {kind: "Return", value: {kind: "Saved", index: 0}}
                ],
            }
        },
        async server => {
            expect(await server.push(["a"])).toEqual(["a", "hello", 12])
        }
    ))
    
    it("allows pushing to nested local arrays", withInputHarness(
        "no storage",
        {
            push: {
                input: [schemaFactory.Any],
                computation: [
                    {
                        kind: "Update",
                        root: {kind: "Saved", index: 0},
                        level: [{kind: "String", value: "array"}],
                        operation: {
                            kind: "Push", 
                            values: [
                                {kind: "String", value: "hello"},
                                {kind: "Int", value: 12}
                            ]
                        }
                    },
                    {
                        kind: "Return", 
                        value: {
                            kind: 'Selection',
                            root: {kind: "Saved", index: 0},
                            level: [{kind: "String", value: "array"}]
                        }
                    }
                ],
            }
        },
        async server => {
            expect(await server.push({array: ["a"]})).toEqual(["a", "hello", 12])
        }
    ))

    it("allows indexing into arrays with an int", withInputHarness(
        "requires storage",
        {
            getFirst: {
                input: [schemaFactory.Array(schemaFactory.Any)],
                computation: [
                    {
                        kind: "Return",
                        value: {
                            kind: "Selection",
                            root: {kind: "Saved", index:0},
                            level: [{kind: "Int", value: 0}]
                        }
                    }
                ]
            }
        },
        async server => {
            expect(await server.getFirst(["a", "b"])).toBe("a")
        }
    ))
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

describe("global objects", () => {
    const GLOBAL: PickNode<"GlobalObject"> = {kind: "GlobalObject", name: TEST_STORE}

    const get: RootNode[] = [
        {
            kind: "Return", 
            value: {
                kind: "Selection", 
                root: GLOBAL,
                level: [{
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

    const set: RootNode[] = [{
        kind: "Update",
        root: GLOBAL,
        level: [{kind: "String", value: "l1"}],
        operation: {kind: "Object", fields: [
            {
                kind: "Field",
                value: {
                    kind: "Int", value: 42
                },
                key: {kind: "String", value: "l2"}
            }
        ]}
    }]

    it("allows calling functions",
        noInputHarness({
            caller: [
                {kind: "Return", value: {
                    kind: "Call", function_name: "callee", args: []
                }}
            ],
            callee: [
                {kind: "Return", value: {kind: "String", value: "Hello"}}
            ]
        },
        async server => {
            expect(await server.caller()).toEqual("Hello")
        }
        )
    )

    it("getting a key returns the value",
        noInputHarness({
            get,
            set,
            getWhole: [
                {kind: "Return", value: {kind: "Selection", level: [], root: GLOBAL}}
            ]
        },
        async server => {
            expect(await server.set()).toBeNull()
            expect(await server.get()).toEqual({l2: 42})
            expect(await server.getWhole()).toEqual({l1: {l2: 42}})
        },
        "requires storage"
        )
    )

    it("allows conditional updates", noInputHarness({
        maybeSet: [
            {kind: "If", conditionally: [{
                kind: "Conditional",
                cond: {
                    kind: "Comparison", 
                    left: {kind: "Selection", root: GLOBAL, level: [{kind: "String", value: "k"}]},
                    right: {kind: "None"},
                    sign: "!="
                },
                do: [
                    {kind: "Save", value: {kind: "Selection", root: GLOBAL, level: [{kind: "String", value: "k"}]}},
                    {kind: "Save", value: {kind: "Object", fields: []}},
                    {kind: "ArrayForEach", target: {kind: "Saved", index: 0}, do: [
                        {
                            kind: "Update",
                            root: {kind: "Saved", index: 1}, level: [{kind: "Saved", index: 2}],
                            operation: {kind: "Selection", root: GLOBAL, level: [{kind: "Saved", index: 2}]}
                        }
                    ]}
                ]
                
            }]},
        ]
        },
        async server => {
            expect(await server.maybeSet()).toBeNull()
        },
        "requires storage"
    ))


    it("allows getting a key with a number key", noInputHarness({
        get: [
            {
                kind: "Return", 
                value: {
                    kind: "Selection", 
                    root: GLOBAL,
                    level: [{
                        kind: "Int",
                        value: 1
                    }]
                }
            }
        ],
        set: [
            {
                kind: "Update",
                root: GLOBAL,
                level: [{kind: "Int", value: 1}],
                operation: {kind: "String", value: "Number field"}
            }
        ]
    },
    async server => {
        expect(await server.set()).toBeNull()
        expect(await server.get()).toEqual("Number field")
    },
    "requires storage"
    ))

    it("can get keys from global objects", 
        noInputHarness({
            getKeys: [{
                kind: "Return",
                value: {kind: "Selection", root: GLOBAL, level: [{kind: "Keys"}]}
            }],
            setKeys: [{
                kind: "Update",
                root: GLOBAL,
                level: [{kind: "String", value: "k1"}],
                operation: {kind: "String", value: "v1"}
            }]
        },
        async server => {
            expect(await server.getKeys()).toEqual([])
            expect(await server.setKeys()).toBeNull()
            expect(await server.getKeys()).toEqual(["k1"])
        },
        "requires storage")
    )

    const getNested: RootNode[] = [
        {
            kind: "Return", 
            value: {
                kind: "Selection", 
                root: GLOBAL,
                level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}]
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

    const setNested: RootNode[] = [{
        kind: "Update",
        root: GLOBAL,
        level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
        operation: {
            kind: "Int", value: 41
        }      
    }]
    it("setting a nested key on a non existent object throws an error",
        noInputHarness(
            {
                setNested,
                get,
                getNested
            },
            async server => {
                await expect(server.setNested()).rejects.toThrowError()
                await expect(server.getNested()).rejects.toThrowError()
                expect(await server.get()).toBeNull()
            },
            "requires storage"
        )
    )

    it("setting a nested key on an existing object",
        noInputHarness(
            {
                setNested,
                set,
                get,
                getNested
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.setNested()).toBeNull()
                expect(await server.getNested()).toEqual(41)
                expect(await server.get()).toEqual({l2: 41})
                expect(await server.set()).toBeNull()
                expect(await server.getNested()).toEqual(42)
            },
            "requires storage"
        )
    )

    const checkL1: RootNode[] = [{
        kind: "Return",
        value: {
            kind: "FieldExists",
            value: GLOBAL,
            field: {kind: "String", value: "l1"}
        }
    }]
    it("can check existence of keys",
        noInputHarness(
            {
                set,
                checkL1
            },
            async server => {
                expect(await server.checkL1()).toBe(false)
                expect(await server.set()).toBeNull()
                expect(await server.checkL1()).toBe(true)
            },
            "requires storage"
        )
    )


    it("allows deleting of keys on global objects",
        noInputHarness(
            
            {
                delete: [
                        {
                            kind: "Update", 
                            root: GLOBAL,
                            level: [{kind: "String", value: "l1"}],
                            operation: {kind: "DeleteField"}
                        }
                    ],
                set,
                get
            },
            async server => {
                expect(await server.delete()).toBeNull()
                expect(await server.set()).toBeNull()
                expect(await server.get()).toEqual({l2: 42})
                expect(await server.delete()).toBeNull()
                expect(await server.get()).toBeNull()
            },
            "requires storage"
        )
    )

    it("allows deleting of nested fields on globals",
        noInputHarness( 
            {
                delete: [
                        {
                            kind: "Update", 
                            root: GLOBAL,
                            level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                            operation: {kind: "DeleteField"}
                        }
                    ],
                set,
                get,
            },
            async server => {
                // Deleting a nested field on an object that does not exist is acceptable.
                expect(await server.delete()).toBeNull()
                expect(await server.set()).toBeNull()
                expect(await server.get()).toEqual({l2: 42})
                expect(await server.delete()).toBeNull()
                expect(await server.get()).toEqual({})
            },
            "requires storage"
        )
    )

    const arrLevel: PickNode<"String"> = {kind: "String", value: "arr"}
    it("can push to arrays in global objects", 
        noInputHarness(
            {
                init: [
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [arrLevel],
                        operation: {kind: "ArrayLiteral", values: []}
                    },
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [{kind: "String", value: "nested"}],
                        operation: {kind: "Object", fields: [{kind: 'Field', key: arrLevel, value: {kind: "ArrayLiteral", values: []}}]}
                    }
                ],
                push: [
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [{kind: "String", value: "arr"}],
                        operation: {kind: "Push", values: [{kind: 'String', value: "HELLO"}]}
                    },
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [{kind: "String", value: "nested"}, arrLevel],
                        operation: {kind: "Push", values: [{kind: 'String', value: "HELLO"}]}
                    }
                ],
                get: [
                    {
                        kind: "Save", value: {kind: "Object", fields: []}
                    },
                    {
                        kind: "ArrayForEach",
                        target: {kind: "Selection", root: GLOBAL, level: [{kind: "Keys"}]},
                        do: [
                            {
                                kind: "Update", 
                                root: {kind: "Saved", index: 0},
                                level: [{kind: "Saved", index: 1}],
                                operation: {kind: "Selection", root: GLOBAL, level: [{kind: "Saved", index: 1}
                                ]}
                            }
                        ]
                    },
                    {
                        kind: "Return",
                        value: {kind: 'Saved', index: 0}
                    }
                ]
            }, 
            async server => {
                expect(await server.init()).toBeNull()
                expect(await server.push()).toBeNull()
                expect(await server.get()).toEqual({arr: ["HELLO"], nested: {arr: ["HELLO"]}})
            },
            "requires storage"
        )
    )

    it("can perform updates to objects within arrays",
        noInputHarness(
            {
                init: [
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [{kind: 'String', value: "l1"}],
                        operation: {
                            kind: "Object",
                            fields: [{
                                kind: "Field",
                                key: {kind: "String", value: "l2"},
                                value: {
                                    kind: "ArrayLiteral",
                                    values: [
                                        {kind: "Bool", value: false}
                                    ]
                                }
                            }]
                        }
                    }
                ],
                update: [
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [{kind: 'String', value: "l1"}, {kind: "String", value: "l2"}, {kind: "Int", value: 0}],
                        operation: {kind: "String", value: "ow"}
                    },
                    {
                        kind: "Return",
                        value: {
                            kind: "Selection",
                            root: GLOBAL,
                            level: [{kind: 'String', value: "l1"}, {kind: "String", value: "l2"}, {kind: "Int", value: 0}]
                        }
                    }
                ]
            },
            async server => {
                expect(await server.init()).toBeNull()
                expect(await server.update()).toEqual("ow")
            },
            "requires storage"
        )
    )

    describe("iterations", () => {
        it("can iterate over local arrays", () => {
            withInputHarness(
                "no storage",
                {
                    sum: {
                        input: [schemaFactory.Array(schemaFactory.double)],
                        computation: [
                            {
                                kind: "Save",
                                value: {kind: "Int", value: 0},
                            },
                            {
                                kind: "ArrayForEach", 
                                target: {kind: "Saved", index: 0},
                                do: [
                                    {
                                        kind: "Update",
                                        operation: {
                                            kind: "Math", 
                                            sign: "+", 
                                            left: {kind: "Saved", index: 1},
                                            right: {kind: "Saved", index: 2}
                                        },
                                        level: [],
                                        root: {kind: "Saved", index: 1}
                                    }
                                ]
                            },
                            {
                                kind: "Return", value: {kind: "Saved", index: 1}
                            }
                        ]
                    }
                },
                async server => {
                    expect(await server.sum([1, 2, 3])).toBe(6)
                }
            )
        })
    })

    

    describe("race condition possible actions", () => {
        it("can perform updates that depend on global state", noInputHarness(
            {
                get, 
                set,
                setToSelfPlusOne: [{
                    kind: "Update",
                    root: GLOBAL,
                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                    operation: {
                        kind: "Math",
                        left: {
                            kind: "Selection", 
                            root: GLOBAL,
                            level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}]
                        },
                        right: {kind: "Int", value: 1},
                        sign: "+"
                    }
                }]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.setToSelfPlusOne()).toBeNull()
                expect(await server.get()).toEqual({l2: 43})
            }, "requires storage")
        )

        it("can perform updates that depend on global state - ifs", noInputHarness(
            {
                get, 
                set,
                setTo0If42: [
                    {
                        kind: "If",
                        conditionally: [
                            {
                                kind: "Conditional",
                                cond: {kind: "FieldExists", field: {kind: "String", value: "l1"}, value: GLOBAL},
                                do: [{
                                    kind: "Update",
                                    root: GLOBAL,
                                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                                    operation: {kind: "Int", value: 0}
                                }]
                            }
                        ]
                    }
                ]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.setTo0If42()).toBeNull()
                expect(await server.get()).toEqual({l2: 0})
            }, "requires storage")
        )

        it("mutation conditional on same global state requires lock", noInputHarness(
            {
                get, 
                set,
                setTo0If42: [
                    {
                        kind: "If",
                        conditionally: [
                            {
                                kind: "Conditional",
                                cond: {
                                    kind:  "BoolAlg", sign: "and", 
                                    left: {kind: "FieldExists", field: {kind: "String", value: "l1"}, value: GLOBAL},
                                    right: {kind: "Bool", value: false}
                                },
                                do: [{kind: "Return"}]
                            },
                            {
                                kind: "Finally",
                                do: [{
                                    kind: "Update",
                                    root: GLOBAL,
                                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                                    operation: {kind: "Int", value: 0}
                                }]
                            }
                        ]
                    }
                ]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.setTo0If42()).toBeNull()
                expect(await server.get()).toEqual({l2: 0})
            }, "requires storage")
        )

        it("can perform updates that depend on some other global state", noInputHarness(
            {
                get, 
                setOther: [{
                    kind: "Update", 
                    root: {kind: "GlobalObject", name: "other"}, 
                    level: [{kind: "String", value: "l1"}],
                    operation: {kind: "Int", value: 734}
                }],
                setToOtherPlusOne: [{
                    kind: "Update",
                    root: GLOBAL,
                    level: [{kind: "String", value: "l1"}],
                    operation: {
                        kind: "Math",
                        left: {
                            kind: "Selection", 
                            root: {kind: "GlobalObject", name: "other"},
                            level: [{kind: "String", value: "l1"}]
                        },
                        right: {kind: "Int", value: 1},
                        sign: "+"
                    }
                }]
            },
            async server => {
                expect(await server.setOther()).toBeNull()
                expect(await server.setToOtherPlusOne()).toBeNull()
                expect(await server.get()).toBe(735)
            }, "requires storage")
        )


        it("can perform updates that depend on global state transitively", noInputHarness(
            {
                get, 
                set,
                setToSelfPlusOne: [
                    {
                        kind: "Save",
                        value: {
                            kind: "Selection", 
                            root: GLOBAL,
                            level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}]
                        }
                    },
                    {
                    kind: "Update",
                    root: GLOBAL,
                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                    operation: {
                        kind: "Math",
                        left: {kind: "Saved", index: 0},
                        right: {kind: "Int", value: 1},
                        sign: "+"
                    }
                }]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.setToSelfPlusOne()).toBeNull()
                expect(await server.get()).toEqual({l2: 43})
            }, "requires storage")
        )

        it("global state taint is transitive through variables", noInputHarness(
            {
                get, 
                set,
                setToSelfPlusOne: [
                    {
                        kind: "Save",
                        value: {
                            kind: "Selection", 
                            root: GLOBAL,
                            level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}]
                        }
                    },
                    {
                        kind: "Save",
                        value: {kind: "Saved", index: 0}
                    },
                    {
                    kind: "Update",
                    root: GLOBAL,
                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                    operation: {
                        kind: "Math",
                        left: {kind: "Saved", index: 1},
                        right: {kind: "Int", value: 1},
                        sign: "+"
                    }
                }]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.setToSelfPlusOne()).toBeNull()
                expect(await server.get()).toEqual({l2: 43})
            }, "requires storage")
        )

        it("global state taint is applied on updates to variables", noInputHarness(
            {
                get, 
                set,
                setToSelfPlusOne: [
                    {
                        kind: "Save",
                        value: {kind: "Int", value: 0}
                    },
                    {
                        kind: "Update", 
                        root: {kind: "Saved", index: 0},
                        level: [],
                        operation: {
                            kind: "Selection", 
                            root: GLOBAL,
                            level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}]
                        },
                    },
                    {
                    kind: "Update",
                    root: GLOBAL,
                    level: [{kind: "String", value: "l1"}, {kind: "String", value: "l2"}],
                    operation: {
                        kind: "Math",
                        left: {kind: "Saved", index: 0},
                        right: {kind: "Int", value: 1},
                        sign: "+"
                    }
                }]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.setToSelfPlusOne()).toBeNull()
                expect(await server.get()).toEqual({l2: 43})
            }, "requires storage")
        )

        it("iterating over an array of globals while writing requires a lock", noInputHarness({
            get,
            set,
            setLookupKeys: [
                {
                    kind: "Update",
                    level: [{kind: "String", value: "arr"}],
                    operation: {kind: "ArrayLiteral", values: [{kind: "String", value: "l1"}]},
                    root: GLOBAL
                }
            ],
            deleteLookupFields: [
                {
                    kind: "ArrayForEach",
                    target: {
                        kind: "Selection", 
                        root: GLOBAL,
                        level: [{kind: "String", value: "arr"}]
                    },
                    do: [
                        {
                            kind: "Update", 
                            root: GLOBAL,
                            level: [{kind: "String", value: "l1"}],
                            operation: {kind: "DeleteField"}
                        }
                    ]
                }
            ]
        },
        async server => {
            expect(await server.set()).toBeNull()
            expect(await server.setLookupKeys()).toBeNull()
            expect(await server.deleteLookupFields()).toBeNull()
            expect(await server.get()).toBeNull()
        }, "requires storage")
        )
        
        const create_user: FunctionData = {
            "computation": [
                {
                    "conditionally": [
                        {
                            "cond": {
                                "kind": "Comparison",
                                "left": {
                                    "kind": "Selection",
                                    "level": [
                                        {
                                            "index": 0,
                                            "kind": "Saved"
                                        }
                                    ],
                                    "root": {
                                        "kind": "GlobalObject",
                                        "name": "users"
                                    }
                                },
                                "right": {
                                    "kind": "None"
                                },
                                "sign": "!="
                            },
                            "do": [
                                {
                                    "kind": "Return",
                                    "value": {
                                        "kind": "String",
                                        "value": "user already exists"
                                    }
                                }
                            ],
                            "kind": "Conditional"
                        }
                    ],
                    "kind": "If"
                },
                {
                    "kind": "Update",
                    "level": [
                        {
                            "index": 0,
                            "kind": "Saved"
                        }
                    ],
                    "operation": {
                        "fields": [
                            {
                                "key": {
                                    "kind": "String",
                                    "value": "chats"
                                },
                                "kind": "Field",
                                "value": {
                                    "kind": "ArrayLiteral",
                                    "values": []
                                }
                            }
                        ],
                        "kind": "Object"
                    },
                    "root": {
                        "kind": "GlobalObject",
                        "name": "users"
                    }
                },
                {
                    "kind": "Return",
                    "value": {
                        "kind": "String",
                        "value": "user created"
                    }
                }
            ],
            "input": [
                {
                    "data": null,
                    "kind": "string"
                }
            ]
        }

        const get_user: FunctionData = {
            "computation": [
                {
                    "kind": "Return",
                    "value": {
                        "fields": [
                            {
                                "key": {
                                    "kind": "String",
                                    "value": "exists"
                                },
                                "kind": "Field",
                                "value": {
                                    "kind": "Comparison",
                                    "left": {
                                        "kind": "Selection",
                                        "level": [
                                            {
                                                "index": 0,
                                                "kind": "Saved"
                                            }
                                        ],
                                        "root": {
                                            "kind": "GlobalObject",
                                            "name": "users"
                                        }
                                    },
                                    "right": {
                                        "kind": "None"
                                    },
                                    "sign": "!="
                                }
                            },
                            {
                                "key": {
                                    "kind": "String",
                                    "value": "val"
                                },
                                "kind": "Field",
                                "value": {
                                    "kind": "Selection",
                                    "level": [
                                        {
                                            "index": 0,
                                            "kind": "Saved"
                                        }
                                    ],
                                    "root": {
                                        "kind": "GlobalObject",
                                        "name": "users"
                                    }
                                }
                            }
                        ],
                        "kind": "Object"
                    }
                }
            ],
            "input": [
                {
                    "data": null,
                    "kind": "string"
                }
            ]
        }
        

        it("should allow checks of existence with comparisons to none", withInputHarness("requires storage",
        {
            get_user,
            create_user            
        },
        
        async server => {
            expect(await server.get_user("me")).toEqual({exists: false, val: null})
            expect(await server.create_user("me")).toEqual("user created")
            expect(await server.create_user("me")).toEqual("user already exists")
            expect(await server.get_user("me")).toEqual({exists: true, val: {chats: []}})
        }))

        it("pushing then returning", withInputHarness("requires storage", 
        {
            push: {
                input: [schemaFactory.string, schemaFactory.Any],

                computation: [
                    {
                        kind: "Update", 
                        root: GLOBAL, 
                        level: [{kind:"Saved",index: 0}], 
                        operation: {kind: "Object", fields: [{kind: "Field", key: {kind: "String", value: "k1"}, value: {kind: "ArrayLiteral", values: []}}]}
                    },
                    {
                        kind: "ArrayForEach",
                        target: {kind: "Saved", index: 1},
                        do: [
                            {
                                kind: "Update", 
                                root: GLOBAL, 
                                level: [{kind:"Saved",index: 2}, {kind: "String", value: "k1"}], 
                                operation: {kind: "Push", values: [
                                    {kind: "Saved", index: 0}
                                ]}
                            },        
                        ]
                    },
                    {
                        kind: "Return", value: {kind: "String", value: "done"}
                    }
                ]
            }

        },
        async server => {
            expect(await server.push("key1", ["key1"])).toEqual("done")
        }))

        it("global state taint is applied on partial updates to variables", noInputHarness(
            {
                get, 
                set,
                updateWithPartialState: [
                    {
                        kind: "Save",
                        value: {kind: "Object", fields: [{
                            kind: "Field",
                            value: {
                                kind: "Selection", 
                                root: GLOBAL,
                                level: [{kind: "String", value: "l1"}]
                            },
                            key: {kind: "String", value: "global_origin"}
                        }]}
                    },
                    {
                        kind: "Update", 
                        root: {kind: "Saved", index: 0},
                        level: [{kind: "String",value: "clean"}],
                        operation: {kind: "Int", value: 12},
                    },
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [{kind: "String", value: "l1"}],
                        operation: {kind: "Saved", index: 0}
                    }
                ]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.updateWithPartialState()).toBeNull()
                expect(await server.get()).toEqual({clean: 12, global_origin: {l2: 42}})
            }, "requires storage")
        )

        it("global state taint is erased on overwrites", noInputHarness(
            {
                get, 
                set,
                updateWithOverwrittenState: [
                    {
                        kind: "Save",
                        value: {kind: "Object", fields: [{
                            kind: "Field",
                            value: {
                                kind: "Selection", 
                                root: GLOBAL,
                                level: [{kind: "String", value: "l1"}]
                            },
                            key: {kind: "String", value: "global_origin"}
                        }]}
                    },
                    {
                        kind: "Update", 
                        root: {kind: "Saved", index: 0},
                        level: [],
                        operation: {kind: "Int", value: 0},
                    },
                    {
                        kind: "Update",
                        root: GLOBAL,
                        level: [{kind: "String", value: "l1"}],
                        operation: {kind: "Saved", index: 0}
                }]
            },
            async server => {
                expect(await server.set()).toBeNull()
                expect(await server.updateWithOverwrittenState()).toBeNull()
                expect(await server.get()).toEqual(0)
            }, "requires storage")
        )
    })

})