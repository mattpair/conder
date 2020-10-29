"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const conder_kernel_1 = require("conder_kernel");
const index_1 = require("../../index");
describe("basic functionality", () => {
    const TEST_STORE = "testStore";
    function testHarness(node, test) {
        const ops = index_1.to_instruction(node);
        const STORES = { TEST_STORE: conder_kernel_1.schemaFactory.Object({}) };
        return (cb) => {
            conder_kernel_1.Test.Mongo.start({ STORES })
                .then(mongo => conder_kernel_1.Test.Server.start({
                MONGO_CONNECTION_URI: `mongodb://localhost:${mongo.port}`,
                SCHEMAS: [],
                DEPLOYMENT_NAME: "statefultest",
                PROCEDURES: { func: ops },
                STORES
            }, "./conder_kernel/")
                .then(server => {
                return test({ call: () => server.invoke("func") }).finally(() => {
                    cb();
                    server.kill();
                });
            })
                .finally(() => mongo.kill()));
        };
    }
    it("can return a field access", testHarness({
        kind: "select",
        store: TEST_STORE,
        after: { kind: "return" }
    }, async (server) => {
        const res = await server.call();
        expect(res).toEqual([]);
    }));
});
//# sourceMappingURL=dag_to_instruction.js.map