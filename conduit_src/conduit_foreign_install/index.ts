import { installPython3Module } from 'src/main/python/installer'
import { Utilities, CompiledTypes } from 'conduit_parser'
import { InstallModuleLookup, ContainerInstruction } from 'src/main/types'

export * as InstallTypes from './src/main/types'


export const InstallForeignPythonModules: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, 
{foreignLookup: InstallModuleLookup, foreignContainerInstr: ContainerInstruction[]}> = {
    stepName: "CreatePythonModules",
    func: ({manifest}) => {
        const installs: CompiledTypes.Python3Install[] = []
        manifest.inScope.forEach(e => {
            if (e.kind === "python3") {
                installs.push(e)
            }
        })

        const res = installPython3Module(installs)
        return Promise.resolve({foreignLookup: res.lookup, foreignContainerInstr: res.instrs})
    }
}