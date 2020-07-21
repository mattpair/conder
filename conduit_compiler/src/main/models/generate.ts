import { Message, Enum } from './../entity/resolved';
import * as fs from 'fs';
import * as child_process from 'child_process';

import { FunctionResolved } from '../entity/resolved';
import { ConduitBuildConfig } from 'config/load';
import { generateClients } from '../compute/gcp/clients';
import { assertNever } from '../util/classifying';


function modelFor(ent: Message | Enum): string {
    switch(ent.kind) {
        case "Enum":
            return `
class ${ent.name}Instance:
    
    def __init__(self, num):
        assert num < ${ent.children.EnumMember.length} and num >= 0
        self.val = num
    

    ${ent.children.EnumMember.map((m, i) => {
return `
    @classmethod
    def ${m.name}(cls):
        return ${ent.name}Instance(${i})
`
    }).join("\n\n")}

def ${ent.name}_from_val(d):
    return ${ent.name}Instance(d)
`

        case "Message":
            return `
class ${ent.name}Instance:
    
    def __init__(self, ${ent.children.Field.map(f => f.name).join(", ")}):
        ${ent.children.Field.map(f => `self.${f.name} = ${f.name}`).join("\n        ")}

def ${ent.name}_from_val(d):
    ${ent.children.Field.map(f => {
        return`${f.name} = ${f.part.FieldType.differentiate().kind === "Primitive" ? `d["${f.name}"]` : `${f.name}_from_val(d["${f.name}"])`}`
    }).join("\n    ")}
    return ${ent.name}Instance(${ent.children.Field.map(f => f.name).join(", ")})

def ${ent.name}_to_dict(inst):
    return {
        ${ent.children.Field.map(f => {
            const type = f.part.FieldType.differentiate()
            switch (type.kind) {
                case "Primitive":
                    return `"${f.name}": inst.${f.name}`
                case "Enum":
                    return `"${f.name}": inst.${f.name}.val`
                case "Message":
                    return `"${f.name}": ${f.name}_to_dict(inst.${f.name})`
                default: assertNever(type)
            }
        }).join(", ")}
    }
`
    }
}

export async function generateModelsToDirectory(manifest: FunctionResolved.Manifest, dir: string): Promise<void> {
    const models: string[] = []
    manifest.namespaces[0].inScope.forEach(v => {
        if (v.kind === "Function") {
            return
        }
        models.push(modelFor(v))
    })

    child_process.execSync(`mkdir -p ${dir}/gen/models`)
    child_process.execSync(`touch ${dir}/gen/models/__init__.py`)
    fs.writeFileSync(`${dir}/gen/models/default_namespace_pb2.py`, models.join('\n\n'))
}

export async function generateModels(manifest: FunctionResolved.Manifest, config: ConduitBuildConfig): Promise<void> {
    for (const dir in config.dependents) {
        await generateModelsToDirectory(manifest, dir)
    }
}

export async function generateModelsAndClients(manifest: FunctionResolved.Manifest, config: ConduitBuildConfig, url: string): Promise<void> {
    await generateModels(manifest, config)
    for (const dir in config.dependents) {
        await generateModelsToDirectory(manifest, dir).then(() => generateClients(url, manifest, dir))   
    }
}