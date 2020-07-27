import { Symbol } from './../../lexicon';
import * as fs from 'fs';
import { FunctionResolved } from '../../entity/resolved';
import { assertNever } from '../../util/classifying';
import { cargolockstr, maindockerfile, cargo } from './constants';
import { StepDefinition } from '../../util/sequence';

function generateParameterList(p: FunctionResolved.Parameter): string {
    const param = p.differentiate()
    if (param.kind === "NoParameter") {
        return ""
    }
    const type = param.part.UnaryParameterType.differentiate()

    switch(type.kind) {
        case "Struct":
            return `${param.name}: ${type.name}`

        default: assertNever(type.kind)
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
            case "Struct":
                externalFuncBody = `let out = internal_${func.name}(msg);\nHttpResponse::Ok().json(out)`
                break;

            default: assertNever(returnType)
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


export const writeRustAndContainerCode: StepDefinition<{ manifest: FunctionResolved.Manifest}, {codeWritten: {main: string, postgres: string}}> = {
    stepName: "writing deployment files",
    func: ({manifest}) => {
        const functions = generateFunctions(manifest.service.functions)
        const structs: string[] = []
        manifest.namespace.inScope.forEach(val => {
            switch (val.kind) {
                case "Function":
                    break;
                case "Struct":
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
                                    case "Struct":
                                        field_type_str = field_type.name
                                        break;

                                    case "Enum":
                                        field_type_str = 'u8'
                                        break;
                                }
                                return `${field.name}: ${field.isRequired ? field_type_str : `Option<${field_type_str}>`}`
                            }).join(",\n")}
                        }
                    `)

            }
        })
        fs.mkdirSync(".deploy/main/src", {recursive: true})
        fs.mkdirSync(".deploy/postgres/startup", {recursive: true})
        return Promise.all([
            fs.promises.writeFile(".deploy/main/Dockerfile", maindockerfile),
            fs.promises.writeFile(".deploy/main/Cargo.lock", cargolockstr),
            fs.promises.writeFile(".deploy/main/Cargo.toml", cargo),
            fs.promises.writeFile(".deploy/main/src/main.rs", `
            use actix_web::{web, App, HttpResponse, HttpServer, Responder};
            use serde::{Deserialize, Serialize};
            use postgres::{Client, NoTls};
            use std::env;
    
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

                let pgloc = env::var("POSTGRES_LOCATION")?;
                let mut client = Client::connect(&format!("host={} user=postgres password=password", pgloc), NoTls)?;
                HttpResponse::Ok().body("Hello world!")
            }
        `),
        fs.promises.writeFile(".deploy/postgres/Dockerfile", `
FROM postgres:12.3

COPY startup/ /docker-entrypoint-initdb.d/
        `),
        fs.promises.writeFile(".deploy/postgres/startup/init.sql", `

        CREATE TABLE cities (
            name            varchar(80),
            location        int
        );
        
        
        insert into cities(name, location)
        values ('detroit', 12)`)
        ]).then(() => ({codeWritten: {main: ".deploy/main", postgres: ".deploy/postgres"}}))
    }
}
