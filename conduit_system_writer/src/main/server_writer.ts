import { OpDef } from './interpreter/derive_supported_ops';
import { WrittenCode } from './types';
import { CompiledTypes, Lexicon, Utilities} from 'conduit_compiler';
import { cargolockstr, maindockerfile, cargo } from './constants';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from './sql'
import { assertNever } from 'conduit_compiler/dist/src/main/utils';
import { writeOperationInterpreter } from './interpreter/interpreter_writer';

function toRustType(p: CompiledTypes.ReturnType): string {
    if (p.kind === "VoidReturnType") {
        return "()"
    }
    return p.isArray ? `Vec<${p.val.name}>` : `${p.val.name}`
}


type FunctionDef = Readonly<{def: string, func_name: string, path: string, method: "get" | "post"}>

function generateRustStructs(val: CompiledTypes.Struct, inScope: CompiledTypes.ScopeMap): string {
    const fields: string[] = val.children.Field.map((field: CompiledTypes.Field) => {
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
           
            case "custom":
                const ent = inScope.getEntityOfType(field_type.name, "Enum", "Struct")
                switch (ent.kind) {
                    case "Struct":
                        field_type_str = field_type.name
                        break;
        
                    case "Enum":
                        field_type_str = 'i16'
                        break;
                }
                
        }
        switch(field.part.FieldType.modification) {
            case "array":
                return `${field.name}: Vec<${field_type_str}>`
            case "none":
                return `${field.name}: ${field_type_str}`   

            case "optional":
                return `${field.name}: Option<${field_type_str}>`

            default: assertNever(field.part.FieldType.modification)
        }  
    })

    const makeStruct = (prefix: string, strFields: string[]) =>  `
    #[derive(Serialize, Deserialize, Clone)]
    struct ${prefix}${val.name}${strFields.length > 0 ? ` {
        ${strFields.join(",\n")}
    }` : `;`}
    `
    if (!val.isConduitGenerated) {
        fields.push(`conduit_entity_id: Option<i32>`)
    }
    return makeStruct('', fields)
}

export const writeRustAndContainerCode: Utilities.StepDefinition<{ 
    manifest: CompiledTypes.Manifest,
    supportedOps: OpDef[]
}, WrittenCode> = {
    stepName: "writing deployment files",
    func: ({manifest, supportedOps}) => {
        const structs: string[] = []
        const stores: Map<string, CompiledTypes.HierarchicalStore> = new Map()
        const functions: FunctionDef[] = []
        manifest.inScope.forEach(val => {
            switch (val.kind) {
                case "Struct":
                    structs.push(generateRustStructs(val, manifest.inScope))
                    break
                case "HierarchicalStore":
                    stores.set(val.name, val)
                    break;
            }
        })
        
        const creates: string[] = []
        const interpreters: string[] = []
        stores.forEach(v => {
            creates.push(createSQLFor(v)); 
            interpreters.push(generateQueryInterpreter(v))
            let retNum = 0 
            let retGen = () => retNum++
            const funcname = `insert_${v.name}`

            const insertInterpreter = `
            async fn ${funcname}(client: &Client, body: &${v.typeName}) -> Result<(), Error> {
                ${generateInsertRustCode(v, "body", {kind: "drop"}, retGen).join("\n")}
                return Ok(());
            }
            `

            interpreters.push(insertInterpreter)
        })

        return Promise.resolve({
            backend: {
                
                postgres: {
                    docker: `
                    FROM postgres:12.3
                    
                    COPY startup/ /docker-entrypoint-initdb.d/
                            `,
                    files: [{
                        name: ".deploy/postgres/startup/init.sql",
                        content: `

                        CREATE TABLE cities (
                            name            varchar(80),
                            location        int
                        );
                
                        ${creates.join("\n")}
                        
                        
                        insert into cities(name, location)
                        values ('detroit', 12)`
                    }]
                },
                main: {
                    docker: maindockerfile,
                    files: [
                        {name: ".deploy/main/Cargo.lock", content: cargolockstr}, 
                        {name: ".deploy/main/Cargo.toml", content: cargo},
                        {
                            name: ".deploy/main/src/main.rs", 
                            content: `
                            #![allow(non_snake_case)]
                            #![allow(non_camel_case_types)]
                            #![allow(redundant_semicolon)]
                            #![allow(unused_variables)]
                            #![allow(dead_code)]
                            use tokio_postgres::{NoTls, Client};
                            use actix_web::{web, App, HttpResponse, HttpServer, Responder};
                            use std::env;
                            use serde::{Deserialize, Serialize};
                            use tokio_postgres::error::{Error};
                            use std::collections::HashMap;
                
                
                            struct AppData {
                                client: Client
                            }
                            
                            #[derive(Serialize, Deserialize)]
                            struct City {
                                name: String,
                                location: i32
                            }
                            
                            // STRUCTS
                            ${structs.join("\n")}
                            // INTERPRETERS
                            ${interpreters.join("\n")}
                            // OP INTERPRETER
                            ${writeOperationInterpreter(manifest, supportedOps)}
                            // FUNCTIONS
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
                            
                        `
                        }
                    ],
                    },
            }
        })
    }
        
}
