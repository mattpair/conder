import { OpFactory } from './interpreter/derive_supported_ops';
import { Utilities, CompiledTypes } from "conduit_compiler";


const functionToByteCode: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest, opFactory: OpFactory}, {}> = {
    stepName: "Converting function to byte code",
    func({}) {
        return Promise.resolve({})
    }
}