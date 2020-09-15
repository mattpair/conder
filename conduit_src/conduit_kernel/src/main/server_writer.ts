
import { writeOperationInterpreter } from './interpreter/interpreter_writer';


type ConstDataAddition = {
    name: string
    type: string
    initializer: string
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
            initializer: `match env::var("PROCEDURES") {
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
            initializer: `match env::var("SCHEMAS") {
                Ok(str) => serde_json::from_str(&str).unwrap(),
                Err(e) => {
                    eprintln!("Did not find any schemas {}", e);
                    Vec::with_capacity(0)
                }
            }`
        },
        {
            name: "client",
            type: "Option<Client>",
            initializer: `match env::var("POSTGRES_SERVICE_HOST") {
                Ok(pgloc) => {
                    let pass = match env::var("POSTGRES_PASSWORD") {
                        Ok(pwd) => pwd,
                        Err(e) => panic!("Received a postgres location, but didn't receive postgres password: {}", e)
                    };
                    let (client, connection) = match tokio_postgres::connect(&format!("host={} user=postgres password={}", pgloc, pass), NoTls).await {
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
                    Some(client)
                },
                Err(e) => {
                    eprintln!("No postgres location specified. Running without storage.");
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
        use tokio_postgres::{NoTls, Client};
        use actix_web::{web, App, HttpResponse, HttpServer, Responder, http};
        use actix_rt::System;
        use std::env;
        use serde::{Deserialize, Serialize};
        use tokio_postgres::error::{Error};
        use std::collections::HashMap;
        use awc;
        use std::borrow::Borrow;
        use bytes::Bytes;


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
                KernelRequest::Noop => conduit_byte_code_interpreter(state, &data.noop, &data.schemas, &data.client),
                KernelRequest::Exec{proc, arg} => match data.procs.get(&proc) {
                    Some(proc) => {
                        state.push(arg);
                        conduit_byte_code_interpreter(state, proc, &data.schemas, &data.client)
                    },
                    None => {
                        eprintln!("Invoking non-existent function {}", &proc);
                        conduit_byte_code_interpreter(state, &data.noop, &data.schemas, &data.client)
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
