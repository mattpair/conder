import { installPython3Module } from './src/main/python/installer'
import { Utilities, CompiledTypes } from 'conduit_parser'
import { InstallModuleLookup, ForeignContainerManifest, Python3InstallInstructions } from './src/main/types'

export type ForeignInstallResults = Readonly<{
    foreignLookup: InstallModuleLookup, 
    foreignContainerInstr: ForeignContainerManifest[]}>

export const InstallForeignPythonModules: Utilities.StepDefinition<{manifest: CompiledTypes.Manifest}, ForeignInstallResults> = {
    stepName: "CreatePythonModules",
    func: ({manifest}) => {
        const installs: CompiledTypes.Python3Install[] = []
        manifest.inScope.forEach(e => {
            if (e.kind === "python3") {
                installs.push(e)
            }
        })

        const res: Python3InstallInstructions = installPython3Module(installs)
        return Promise.resolve({foreignLookup: res.lookup, foreignContainerInstr: res.instrs})
    }
}