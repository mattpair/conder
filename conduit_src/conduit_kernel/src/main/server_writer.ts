import { AnySchemaInstance } from 'conduit_parser';

import { writeOperationInterpreter } from './interpreter/interpreter_writer';
import { OpInstance, AnyOpInstance } from './interpreter/supported_op_definition';


type ConstDataAddition = {
    name: string
    type: string
    initializer: string
}

export enum Var {
    MONGO_CONNECTION_URI="MONGO_CONNECTION_URI",
    PROCEDURES="PROCEDURES",
    SCHEMAS="SCHEMAS",
    STORES="STORES"
}

export type EnvVarType<E extends Var> = 
E extends Var.STORES ? Record<string, AnySchemaInstance> :
E extends Var.SCHEMAS ? AnySchemaInstance[] :
E extends Var.PROCEDURES ? Record<string, AnyOpInstance[]> :
E extends Var.MONGO_CONNECTION_URI ? string :
never

export type RequiredEnv = Var.SCHEMAS | Var.PROCEDURES | Var.STORES 

// Strong refers to the fact that the type bounds are more specific.
export type StrongServerEnv= {[E in Exclude<Var, RequiredEnv>]?: EnvVarType<E>} & {
    [E in RequiredEnv]: EnvVarType<E>
} 
export type ServerEnv = {[E in Exclude<Var, RequiredEnv>]?: string} & {
    [E in RequiredEnv]: string
} 

export function generateServer(): string {
    const app_data_adds: ConstDataAddition[] = [
        {
            name: "noop",
            type: "Vec<Op>",
            initializer: `serde_json::from_str(r#####"[]"#####).unwrap()`
        },
        {
            name: "procs",
            type: "HashMap<String, Vec<Op>>",
            initializer: `match env::var("${Var.PROCEDURES}") {
                Ok(str) => serde_json::from_str(&str).unwrap(),
                Err(e) => {
                    eprintln!("Did not find any procedures {}", e);
                    HashMap::with_capacity(0)
                }
            }`
        },
        {
            name: "schemas",
            type: "Vec<Schema>",
            initializer: `match env::var("${Var.SCHEMAS}") {
                Ok(str) => serde_json::from_str(&str).unwrap(),
                Err(e) => {
                    eprintln!("Did not find any schemas {}", e);
                    Vec::with_capacity(0)
                }
            }`
        },
        {
            name: "stores",
            type: "HashMap<String, Schema>",
            initializer: `match env::var("${Var.STORES}") {
                Ok(r) => serde_json::from_str(&r).unwrap(),
                Err(e) => panic!("Did not receive a definition for any stores")
            }`
        },
        {
            name: "db",
            type: "Option<mongodb::Database>",
            initializer: `match env::var("${Var.MONGO_CONNECTION_URI}") {
                Ok(uri) => {

                    let client = match mongodb::Client::with_uri_str(&uri).await {
                        Ok(r) => r,
                        Err(e) => panic!("Failure connecting to mongo: {}", e)
                    };

                    // List the names of the databases in that deployment.
                    let cols = match client.database("conduit").list_collection_names(None).await {
                        Ok(r) => r,
                        Err(e) => panic!("Failure connecting to mongo: {}", e)
                    };
                    for col in  cols{
                        println!("{}", col);
                    }
                    Some(client.database("conduit"))
                },
                Err(e) => {
                    eprintln!("No mongo location specified. Running without storage.");
                    None
                }
            }`
        }
    ]


    return `
        #![allow(non_snake_case)]
        #![allow(non_camel_case_types)]
        #![allow(redundant_semicolons)]
        #![allow(unused_variables)]
        #![allow(dead_code)]
        #![allow(unused_imports)]
        use actix_web::{web, App, HttpResponse, HttpServer, Responder, http};
        use actix_rt::System;
        use std::env;
        use serde::{Deserialize, Serialize};
        use std::collections::HashMap;
        use std::future::Future;
        use std::task::{Poll, Context};
        use std::pin::Pin;
        use awc;
        use std::borrow::Borrow;
        use bytes::Bytes;
        use mongodb::{Database};
        use std::convert::TryFrom;
        mod storage;


        struct AppData {
            ${[app_data_adds.map(a => `${a.name}: ${a.type}`)].join(",\n")}
        }
        
        #[derive(Deserialize)]
        #[serde(tag = "kind", content= "data")]
        enum KernelRequest {
            Noop,
            Exec {proc: String, arg: InterpreterType}
        }

        ${writeOperationInterpreter()}

        #[actix_rt::main]
        async fn main() -> std::io::Result<()> {
            let args: Vec<String> = env::args().collect();

            HttpServer::new(|| {
                App::new()
                    .data_factory(|| make_app_data())
                    .route("/", web::put().to(index))
            })
            .bind(format!("0.0.0.0:{}", args[1]))?
            .run()
            .await
        }

        async fn index(data: web::Data<AppData>, input: web::Json<KernelRequest>) -> impl Responder {
            let mut state = vec![];
            let req = input.into_inner();
            return match req {
                KernelRequest::Noop => conduit_byte_code_interpreter(state, &data.noop, &data.schemas, data.db.as_ref(), &data.stores),
                KernelRequest::Exec{proc, arg} => match data.procs.get(&proc) {
                    Some(proc) => {
                        state.push(arg);
                        conduit_byte_code_interpreter(state, proc, &data.schemas, data.db.as_ref(), &data.stores)
                    },
                    None => {
                        eprintln!("Invoking non-existent function {}", &proc);
                        conduit_byte_code_interpreter(state, &data.noop, &data.schemas, data.db.as_ref(), &data.stores)
                    }
                }
            }.await;
        }

        async fn make_app_data() -> Result<AppData, ()> {
            return Ok(AppData {
                ${app_data_adds.map(a => `${a.name}: ${a.initializer}`).join(",\n")}
            });
        }
        `
        
}
