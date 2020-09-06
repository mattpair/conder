import { AnyOpDef, AllTypesMember } from './interpreter/derive_supported_ops';
import { WrittenCode } from './types';
import { CompiledTypes, Utilities} from 'conduit_parser';
import { cargolockstr, maindockerfile, cargo } from './constants';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from './sql'
import { writeOperationInterpreter } from './interpreter/interpreter_writer';
import { WritableFunction } from './statement_converter';
import { toAnyType } from './toAnyType';
import { TypeWriter } from './type_writing/type_writer';
import { ForeignInstallResults } from 'conduit_foreign_install';

function toRustType(p: CompiledTypes.ReturnType, inScope: CompiledTypes.ScopeMap): string {
    switch (p.kind) {
        case "VoidReturnType":
            return "()";
        case "CustomType":
        case "Primitive":
            return TypeWriter.rust.reference(p, inScope)
    }

}

type ConstDataAddition = {
    name: string
    type: string
    initializer: string
}

type FunctionDef = Readonly<{
    def: string, 
    func_name: string, 
    path: string, 
    method: "get" | "post",
    allDataAdditions: ConstDataAddition[]
}>


function writeFunction(f: WritableFunction, scopeMap: CompiledTypes.ScopeMap): FunctionDef {
    const exec_name = `${f.name}_executable`
    const param = f.parameter.differentiate()
    const input: {param: string, extract: string} = param.kind === "NoParameter" ? 
    {param: "", extract: ""}
        :
    {
        param: `, input: web::Json<${toRustType(param.type, scopeMap)}>`, 
        extract: `
        let innerInput = input.into_inner();
        state.push(${toAnyType(param.type, scopeMap)}(&innerInput));
        `
    }


    return {
        def: `
        
        async fn ${f.name}(data: web::Data<AppData>${input.param}) -> impl Responder {
            let mut state: Vec<AnyType> = Vec::with_capacity(${f.maximumNumberOfVariables});
            ${input.extract}
            return conduit_byte_code_interpreter(&data.client, &mut state, &data.${exec_name}).await;
        }
        `,
        //@ts-ignore
        method: f.method.toLocaleLowerCase(),
        path: f.name,
        func_name: f.name,
        allDataAdditions: [
            {
                name: exec_name,
                type: "Vec<Op>",
                initializer: `serde_json::from_str(r#####"${JSON.stringify(f.body, null, 2)}"#####).unwrap()`
            }
        ]
    }
}

export const writeRustAndContainerCode: Utilities.StepDefinition<{ 
    manifest: CompiledTypes.Manifest,
    supportedOps: AnyOpDef[],
    functions: WritableFunction[],
    allTypesUnion: AllTypesMember[],
    additionalRustStructsAndEnums: string[]
} & ForeignInstallResults, WrittenCode> = {
    stepName: "writing deployment files",
    func: ({manifest, supportedOps, functions, allTypesUnion, additionalRustStructsAndEnums, foreignLookup}) => {
        const structs: string[] = []
        const stores: Map<string, CompiledTypes.HierarchicalStore> = new Map()
        const f_defs: FunctionDef[] = functions.map(i => writeFunction(i, manifest.inScope))
        const app_data_adds: ConstDataAddition[] = []
        f_defs.forEach(f => app_data_adds.push(...f.allDataAdditions))

        manifest.inScope.forEach(val => {
            switch (val.kind) {
                case "Struct":
                    structs.push(TypeWriter.rust.definition(val, manifest.inScope))
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
                            #![allow(unused_imports)]
                            use tokio_postgres::{NoTls, Client};
                            use actix_web::{web, App, HttpResponse, HttpServer, Responder};
                            use actix_rt::System;
                            use std::env;
                            use serde::{Deserialize, Serialize};
                            use tokio_postgres::error::{Error};
                            use std::collections::HashMap;
                            use awc;
                            use std::borrow::Borrow;
                            use bytes::Bytes;
                
                
                            struct AppData {
                                ${[`client: Client`, app_data_adds.map(a => `${a.name}: ${a.type}`)].join(",\n")}
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
                            ${writeOperationInterpreter(supportedOps, allTypesUnion, foreignLookup)}
                            // FUNCTIONS
                            ${f_defs.map(f => f.def).join("\n\n")}
                    
                            //ADDITIONAL
                            ${additionalRustStructsAndEnums.join("\n")}
                            #[actix_rt::main]
                            async fn main() -> std::io::Result<()> {
                                HttpServer::new(|| {
                                    App::new()
                                        .data_factory(|| make_app_data())
                                        .route("/", web::get().to(index))
                                        ${f_defs.map(f => `.route("/${f.path}", web::${f.method}().to(${f.func_name}))`).join("\n")}
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
                                    ${app_data_adds.map(a => `${a.name}: ${a.initializer}`).join(",\n")}
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
