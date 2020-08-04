import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import * as fs from 'fs';
import { cargolockstr, maindockerfile, cargo } from './constants';

type InsertCodelet = {
    readonly sql: string,
    readonly array: string
}

function generateInsertStatement(stmt: CompiledTypes.Append): InsertCodelet {
    const columns = stmt.into.stores.children.Field.map(i => i.name).join(", ")
    const tableAndColumns: string = `${stmt.into.name}(${columns})`
    const values = `values (${stmt.inserting.type.val.children.Field.map((_, i) => `$${i + 1}`).join(", ")})`
    const array = `&[${stmt.inserting.type.val.children.Field.map(f => `&${stmt.inserting.name}.${f.name}`).join(", ")}]`
    return {
        sql: `insert into ${tableAndColumns} ${values}`,
        array
    }
}

type InternalFunction = {
    readonly definition: string,
    readonly invocation: string
}

function toRustType(p: CompiledTypes.ReturnType): string {
    if (p.kind === "VoidReturnType") {
        return "()"
    }
    return p.isArray ? `Vec<${p.val.name}>` : `${p.val.name}`
}

function generateInternalFunction(f: CompiledTypes.Function): InternalFunction {
    const ret = f.returnType
    const returnTypeSpec = ` -> Result<${toRustType(ret)}, Error>`
    const statements: string[] = []
    const param = f.parameter.differentiate()
    const parameterList: {name: string, type: string}[] = []
    if (param.kind !== "NoParameter") {
        parameterList.push({name: param.name, type: toRustType(param.type)})
    }
    if (f.requiresDbClient) {
        parameterList.push({name: "client", type: "&Client"})
    }
    

    let previousReturn = false
    f.body.statements.forEach((stmt, i) => {
        switch(stmt.kind) {
            case "Append":
                const s = generateInsertStatement(stmt)
                statements.push(`
                let res${i} = client.query("${s.sql}", ${s.array}).await?;
                `)
                break;

            case "ReturnStatement":
                previousReturn = true
                break;

            case "VariableReference":
                if (previousReturn) {
                    statements.push(`return Ok(${stmt.name});`)
                } else {
                    throw Error(`Useless variable reference ${stmt.name}`)
                }
                break;
            
            case "StoreReference":
                if (previousReturn) {
                    statements.push(`
                    let mut allin = client.query("select * from ${stmt.from.name}", &[]).await?;
 
                    let mut out = Vec::with_capacity(allin.len());
            
                    while let Some(row) = allin.pop() {
                        out.push(${stmt.returnType.val.name} {
                            ${stmt.from.stores.children.Field.map((field, index) => `${field.name}: row.get(${index})`).join(",\n")}

                        })
                    }
                    return Ok(out);

                    `)
                    break
                } else {
                    throw Error(`Currently don't support all in queries outside of returns`)
                }

            default: Utilities.assertNever(stmt)
        }
    })

    if (ret.kind === "VoidReturnType") {
        statements.push(`return Ok(())`)
    }
    
    
    return {
        definition: `
        ${f.requiresDbClient ? "async ": ""}fn internal_${f.name}(${parameterList.map(p => `${p.name}: ${p.type}`).join(", ")}) ${returnTypeSpec} {
            ${statements.join(";\n")}
        }`, 
        invocation: `internal_${f.name}(${parameterList.map(p => p.name)})${f.requiresDbClient ? ".await" : ""}`
    }
}

function generateFunctions(functions: CompiledTypes.Function[]): {def: string, func_name: string, path: string, method: "get" | "post"}[] {
    return functions.map(func => {

        const internal = generateInternalFunction(func) 
        const param = func.parameter.differentiate()
        
        let parameters: string[] = []
        let extractors: string[] = []

        if (param.kind === "UnaryParameter") {
            const ptype = param.type
            parameters.push(`input: web::Json<${toRustType(ptype)}>`)
            extractors.push(`let ${param.name} = input.into_inner();`)
        }

        if (func.requiresDbClient) {
            parameters.push("data: web::Data<AppData>")
            extractors.push("let client = &data.client;")
        }

        const returnType = func.returnType
        let externalFuncBody = ''

        switch (returnType.kind) {
            case "VoidReturnType":
                externalFuncBody = `match ${internal.invocation} {
                    Ok(()) => HttpResponse::Ok().finish(),
                    Err(err) => {
                        HttpResponse::BadRequest().body(format!("Failure caused by: {}", err))
                    }
                };
                `
                break;
            case "real type":
                externalFuncBody = `match ${internal.invocation} {
                    Ok(out) => HttpResponse::Ok().json(out),
                    Err(err) => {
                        HttpResponse::BadRequest().body(format!("Failure caused by: {}", err))
                    }
                };`
                break;

            default: Utilities.assertNever(returnType)
        }
        
        const external = `
        async fn external_${func.name}(${parameters.join(", ")}) -> impl Responder {
            ${extractors.join("\n")}
            return ${externalFuncBody}
        }
                
        `
        return {def: `${internal.definition}\n${external}`, func_name: `external_${func.name}`, path: func.name, method: func.method === "POST" ? "post" : 'get'}
    })
}


export const writeRustAndContainerCode: Utilities.StepDefinition<{ manifest: CompiledTypes.Manifest}, {codeWritten: {main: string, postgres: string}}> = {
    stepName: "writing deployment files",
    func: ({manifest}) => {
        const functions = generateFunctions(manifest.service.functions)
        const structs: string[] = []
        const tables: string[] = []
        manifest.namespace.inScope.forEach(val => {
            switch (val.kind) {
                case "Function":
                    break;
                case "Struct":
                    structs.push(`
                        #[derive(Serialize, Deserialize)]
                        struct ${val.name} {
                            ${val.children.Field.map((field: CompiledTypes.Field) => {
                                const field_type = field.part.FieldType.differentiate()
                                let field_type_str = ''
                                switch (field_type.kind) {
                                    case "Primitive":
                                        switch (field_type.val) {
                                            case Lexicon.Symbol.double:
                                                field_type_str = "f64"
                                                break;
                                            case Lexicon.Symbol.float:
                                                field_type_str ="f32"
                                                break;
                                            case Lexicon.Symbol.int32:
                                                field_type_str ="i32"
                                                break;
                                            case Lexicon.Symbol.int64:
                                                field_type_str ="i64"
                                                break;
                                            case Lexicon.Symbol.string:
                                                field_type_str = "String"
                                                break;
                                            case Lexicon.Symbol.uint32:
                                                field_type_str = "u32"
                                                break;
                                            case Lexicon.Symbol.uint64:
                                                field_type_str = "u64"
                                                break;
                                            case Lexicon.Symbol.bool:
                                                field_type_str = "bool"
                                                break;

                                            case Lexicon.Symbol.bytes:
                                                throw new Error("bytes isn't a supporetd type yet")

                                            default: Utilities.assertNever(field_type.val)
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
                    break
                case "StoreDefinition":
                    tables.push(`
                    CREATE TABLE ${val.name} (
                        ${val.stores.children.Field.map(f => {
                            let typeStr = ''
                            const type = f.part.FieldType.differentiate()
                            switch(type.kind) {
                                case "Enum":
                                    throw Error("Don't support enum stores yet")
                                case "Struct":
                                    throw Error("Don't support struct stores yet")
                                case "Primitive":
                                    const prim = type.val
                                    switch(prim) {
                                        case Lexicon.Symbol.bool:
                                            typeStr = "boolean"
                                            break
                                        case Lexicon.Symbol.bytes:
                                            throw Error("bytes aren't supported for stores yet")

                                        case Lexicon.Symbol.double:
                                            typeStr = "double precision"
                                            break
                                        case Lexicon.Symbol.float:
                                            typeStr ="real"
                                            break
                                        case Lexicon.Symbol.int32:
                                            typeStr = "integer"
                                            break
                                        case Lexicon.Symbol.int64:
                                            typeStr = "bigint"
                                            break
                                        case Lexicon.Symbol.uint32:
                                        case Lexicon.Symbol.uint64:
                                            typeStr = "bigint"
                                            console.warn("storing uints as signed integers")
                                            break
                                        case Lexicon.Symbol.string:
                                            typeStr = "text"
                                            break

                                        default: Utilities.assertNever(prim)
                                    }
                            }
                            return `${f.name}\t${typeStr}`
                        }).join(",\n")}
                    );

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
            #![allow(non_snake_case)]
            #![allow(non_camel_case_types)]
            #![allow(redundant_semicolon)]
            use tokio_postgres::{NoTls, Client};
            use actix_web::{web, App, HttpResponse, HttpServer, Responder};
            use std::env;
            use serde::{Deserialize, Serialize};
            use tokio_postgres::error::{Error};


            struct AppData {
                client: Client
            }
            
            #[derive(Serialize, Deserialize)]
            struct City {
                name: String,
                location: i32
            }
            
    
            ${structs.join("\n")}
    
            ${functions.map(f => f.def).join("\n\n")}
    
            #[actix_rt::main]
            async fn main() -> std::io::Result<()> {
                HttpServer::new(|| {
                    App::new()
                        .data_factory(|| make_app_data())
                        .route("/", web::get().to(index))
                        ${functions.map(f => `.route("/${f.path}", web::${f.method}().to(${f.func_name}))`).join("\n")}
                })
                .bind("0.0.0.0:8080")?
                .run()
                .await
            }
    
            async fn index(data: web::Data<AppData>) -> impl Responder {
                let mut rows = match data.client.query("select name, location from cities", &[]).await {
                    Ok(rows) => rows,
                    Err(err) => panic!("didn't succeed: {}", err)
                };
            
                let mut out = Vec::with_capacity(rows.len());
            
                while let Some(row) = rows.pop() {
                    out.push(City {
                        name: row.get(0),
                        location: row.get(1)
                    })
                }
                return HttpResponse::Ok().json(out);
            }

            async fn make_app_data() -> Result<AppData, ()> {
                let host = match env::var("POSTGRES_SERVICE_HOST") {
                    Ok(pgloc) => pgloc,
                    Err(e) => panic!("didn't receive postgres location: {}", e)
                };
                let pwd = match env::var("POSTGRES_PASSWORD") {
                    Ok(pgloc) => pgloc,
                    Err(e) => panic!("didn't receive postgres password: {}", e)
                };
            
                let (client, connection) = match tokio_postgres::connect(&format!("host={} user=postgres password={}", host, pwd), NoTls).await {
                    Ok(out) => out,
                    Err(e) => panic!("couldn't create connection: {}", e)
                };
                
                // The connection object performs the actual communication with the database,
                // so spawn it off to run on its own.
                actix_rt::spawn(async move {
                    if let Err(e) = connection.await {
                        eprintln!("connection error: {}", e);
                    }
                });
                
                 
                return Ok(AppData {
                    client: client,
                });
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

        ${tables.join("\n")}
        
        
        insert into cities(name, location)
        values ('detroit', 12)`)
        ]).then(() => ({codeWritten: {main: ".deploy/main", postgres: ".deploy/postgres"}}))
    }
}