import { Symbol } from './../../lexicon';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { FunctionResolved } from '../../entity/resolved';
import { assertNever } from '../../util/classifying';
import { cargolockstr, dockerfile, cargo } from './constants';


function generateParameterList(p: FunctionResolved.Parameter): string {
    const param = p.differentiate()
    if (param.kind === "NoParameter") {
        return ""
    }
    const type = param.part.UnaryParameterType.differentiate()

    switch(type.kind) {
        case "Enum":
            throw new Error(`Enum parameter types aren't actually supported`)
        case "Message":
            return `${param.name}: ${type.name}`
    }
    
}

function generateInternalFunction(f: FunctionResolved.Function): string {
    const ret = f.part.ReturnTypeSpec.differentiate()
    let returnTypeSpec = ''
    let returnStatement= ''
    if (ret.kind === "VoidReturnType") {
        returnTypeSpec = ' -> ()'
        returnStatement = ''
    } else {
        returnTypeSpec = ` -> ${ret.name}`
        returnStatement = `return ${f.part.FunctionBody.children.Statement[0].differentiate().val}`
    }

    return `
    fn internal_${f.name}(${generateParameterList(f.part.Parameter)}) ${returnTypeSpec} {
        ${returnStatement}
    }
    `
}

function generateFunctions(functions: FunctionResolved.Function[]): {def: string, func_name: string, path: string}[] {
    return functions.map(func => {

        const internal = generateInternalFunction(func) 
        const param = func.part.Parameter.differentiate()
        
        let paramStr: string = ''

        if (param.kind === "UnaryParameter") {
            const ptype = param.part.UnaryParameterType.differentiate()
            paramStr = `input: web::Json<${ptype.name}>`
        } else {
            throw new Error("No parameter functions actually aren't supported")
        }

        const returnType = func.part.ReturnTypeSpec.differentiate()
        let externalFuncBody = ''

        switch (returnType.kind) {
            case "VoidReturnType":
                externalFuncBody = `internal_${func.name}(msg);\nHttpResponse::Ok()`
                break;
            case "Enum":
                throw Error("enum return types aren't actually supported")
            case "Message":
                externalFuncBody = `let out = internal_${func.name}(msg);\nHttpResponse::Ok().json(out)`
                break;
        }
        
        const external = `
        async fn external_${func.name}(${paramStr}) -> impl Responder {
            let msg = input.into_inner();
            ${externalFuncBody}
        }
                
        `
        return {def: `${internal}\n${external}`, func_name: `external_${func.name}`, path: func.name}
    })
}

type StepDefinition<INPUT, ADDED> = Readonly<{
    stepName: string 
    func: (arg0: INPUT) => Promise<ADDED>
}>

class Sequence<INPUT extends {}, OUTPUT extends {}> {
    readonly def: StepDefinition<INPUT, OUTPUT>
    
    constructor(def: StepDefinition<INPUT, OUTPUT>) {
        this.def = def
    }

    then<NEXT extends {}>(nextStep: StepDefinition<INPUT & OUTPUT, NEXT>): Sequence<INPUT, INPUT & OUTPUT & NEXT> {
        return new Sequence<INPUT, INPUT & OUTPUT & NEXT>({
            stepName: "",
            func: async (arg0: INPUT) => {
                try {
                    if (this.def.stepName !== "") {
                        console.log(`Running step: ${this.def.stepName}`)
                    }
                    return await this.def.func(arg0).then(async (add: OUTPUT) => {
                        if (nextStep.stepName !== "") {
                            console.log(`Running step: ${nextStep.stepName}`)
                        }
                        const next = await nextStep.func({...arg0, ...add}).catch(err => {
                            console.error(`Failure in step: ${this.def.stepName}`, err)
                            process.exit(1)
                        })
                        return {...arg0, ...add, ...next}
                    })
                } catch (e) {
                    console.error(`Failure in step: ${this.def.stepName}`, e)
                    process.exit(1)
                }
                
            },
        })

    }

    run(i: INPUT): Promise<OUTPUT> {
        return this.def.func(i)
    }

}

export async function containerize(manifest: FunctionResolved.Manifest): Promise<string> {
    const functions = generateFunctions(manifest.service.functions)
    const structs: string[] = []
    manifest.namespace.inScope.forEach(val => {
        switch (val.kind) {
            case "Function":
                break;
            case "Message":
                structs.push(`
                    #[derive(Serialize, Deserialize)]
                    struct ${val.name} {
                        ${val.children.Field.map(field => {
                            const field_type = field.part.FieldType.differentiate()
                            let field_type_str = ''
                            switch (field_type.kind) {
                                case "Primitive":
                                    switch (field_type.val) {
                                        case Symbol.double:
                                            field_type_str = "f64"
                                            break;
                                        case Symbol.float:
                                            field_type_str ="f32"
                                            break;
                                        case Symbol.int32:
                                            field_type_str ="i32"
                                            break;
                                        case Symbol.int64:
                                            field_type_str ="i64"
                                            break;
                                        case Symbol.string:
                                            field_type_str = "String"
                                            break;
                                        case Symbol.uint32:
                                            field_type_str = "u32"
                                            break;
                                        case Symbol.uint64:
                                            field_type_str = "u64"
                                            break;
                                        case Symbol.bool:
                                            field_type_str = "bool"
                                            break;

                                        case Symbol.bytes:
                                            throw new Error("bytes isn't a supporetd type yet")

                                        default: assertNever(field_type.val)
                                    }
                                    break;
                                case "Message":
                                    field_type_str = field_type.name
                                    break;

                                case "Enum":
                                    field_type_str = 'u8'
                                    break;
                            }
                            return `${field.name}: ${field_type_str}`
                        }).join(",\n")}
                    }
                `)

        }
    })
    fs.mkdirSync(".deploy/src", {recursive: true})
    
    const initial = new Sequence<{}, {}>({
        stepName: "writing deployment files",
        func: () => {
            return Promise.all([
                fs.promises.writeFile(".deploy/Dockerfile", dockerfile),
                fs.promises.writeFile(".deploy/Cargo.lock", cargolockstr),
                fs.promises.writeFile(".deploy/Cargo.toml", cargo),
                fs.promises.writeFile(".deploy/src/main.rs", `
                use actix_web::{web, App, HttpResponse, HttpServer, Responder};
                use serde::{Deserialize, Serialize};
        
                ${structs.join("\n")}
        
                ${functions.map(f => f.def).join("\n\n")}
        
                #[actix_rt::main]
                async fn main() -> std::io::Result<()> {
                    HttpServer::new(|| {
                        App::new()
                            .route("/", web::get().to(index))
                            ${functions.map(f => `.route("/${f.path}", web::post().to(${f.func_name}))`).join("\n")}
                    })
                    .bind("0.0.0.0:8080")?
                    .run()
                    .await
                }
        
                async fn index() -> impl Responder {
                    HttpResponse::Ok().body("Hello world!")
                }
            `)
            ]).then(() => ({}))
        }
    })
    
    const out = initial.then<{}>({
        stepName: "containerize",
        func: () => {
            child_process.execSync("docker build -t conder-systems/cloud-run-gen .", {cwd: ".deploy/", stdio: "inherit"})
            return Promise.resolve({})
        }
    }).then<{remoteContainer: string}>({
        stepName: "push container",
        func: () => {
            child_process.execSync("docker tag conder-systems/cloud-run-gen us.gcr.io/conder-systems-281115/hello-world-gen", {cwd: ".deploy/"})
            child_process.execSync("docker push us.gcr.io/conder-systems-281115/hello-world-gen")
            return Promise.resolve({remoteContainer: "us.gcr.io/conder-systems-281115/hello-world-gen:latest"})
        }
    })
    

    return (await out.def.func({})).remoteContainer
}


