import { CompiledTypes } from 'conduit_parser';
import { ForeignContainerManifest, Python3InstallInstructions } from '../types';
import * as fs from 'fs';
import * as child_process from 'child_process'

type ForeignFunctionDef = Readonly<{url_path: string}>

type PartialInstalledModuleDef = Readonly<{functions: Map<string, ForeignFunctionDef>, service_name: string}>

type PartialInstallModuleLookup = Map<string, PartialInstalledModuleDef>

type FunctionHarnessDef = Readonly<{
    body: string,
    import: string
}>

export function installPython3Module(installs: CompiledTypes.Python3Install[]): Python3InstallInstructions {
    const lookup: PartialInstallModuleLookup = new Map()
    const instrs: ForeignContainerManifest[] = []
    installs.forEach((install, install_count) => {
        const functions: Map<string, ForeignFunctionDef> = new Map()
        
        const file = fs.readFileSync(`${install.reldir}/${install.file}`, {encoding: "utf-8"})
        const deploy_dir = fs.mkdtempSync(".deploy")
        child_process.execSync(`cp -r ${install.reldir} ${deploy_dir}`)
        fs.writeFileSync(`${deploy_dir}/Dockerfile`, 
        `FROM python:3.8-slim-buster
        WORKDIR /flask_app/home
        EXPOSE 8080
        RUN pip install --upgrade pip
        RUN pip install flask gunicorn
        COPY . .
        CMD ["gunicorn", "--bind", "0.0.0.0:8080", "generated_app_harness:app"]

        `)

        const functions_regex = /[\n\r]*def +(?<name>\w+)\(\):/g
        const path_definitions: FunctionHarnessDef[] = []
        let r
        while (r = functions_regex.exec(file)) {
            
            const func_name = r.groups.name
            console.log(`Adding function ${func_name}`)
            const path_name = `/${func_name}`
            path_definitions.push({
                body: `
@app.route("${path_name}")
def path_${func_name}():
    return ${func_name}()
`,
                import: `from ${install.file.substr(0, install.file.length - 3)} import ${func_name}`
            })

            functions.set(func_name, {url_path: path_name})
        }
        
        fs.writeFileSync(`${deploy_dir}/generated_app_harness.py`,
`
from flask import Flask
${path_definitions.map(p => p.import).join("\n")}
app = Flask(__name__)

@app.route("/")
def hello():
    return "Hello, World!"

${path_definitions.map(p => p.body).join("\n\n")}
`)
        instrs.push({dockerfile_dir: deploy_dir, name_service: install.name})
        lookup.set(install.name, {functions, service_name: install.name})
        
    })
    return {lookup, instrs: instrs}
}
