"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.to_instruction = void 0;
const conder_kernel_1 = require("conder_kernel");
const opWriter = conder_kernel_1.getOpWriter();
function to_instruction(node) {
    switch (node.kind) {
        case "return":
            return [opWriter.returnStackTop];
        case "select":
            return [
                opWriter.instantiate({}),
                opWriter.queryStore([node.store, {}]),
                ...to_instruction(node.after)
            ];
        default: conder_kernel_1.Utils.assertNever(node);
    }
}
exports.to_instruction = to_instruction;
//# sourceMappingURL=DAG.js.map