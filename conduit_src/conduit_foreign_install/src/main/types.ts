
export type ForeignFunctionDef = Readonly<{url_path: string}>
export type InstalledModuleDef = Readonly<{functions: ReadonlyMap<string, ForeignFunctionDef>, service_name: string}>
export type InstallModuleLookup = ReadonlyMap<string, InstalledModuleDef>
export type ForeignContainerManifest = Readonly<{dockerfile_dir: string, name_service: string}>
export type Python3InstallInstructions = Readonly<{
    lookup: InstallModuleLookup
    instrs: ForeignContainerManifest[]
}>
