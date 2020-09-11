
import { writeOperationInterpreter } from './interpreter/interpreter_writer';


type ConstDataAddition = {
    name: string
    type: string
    initializer: string
}

export function generateServer(): string {
    const app_data_adds: ConstDataAddition[] = [
        {
            name: "executable",
            type: "Vec<Op>",
            initializer: `serde_json::from_str(r#####"[]"#####).unwrap()`
        }
    ]


    return `
        #![allow(non_snake_case)]
        #![allow(non_camel_case_types)]
        #![allow(redundant_semicolon)]
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
        

        ${writeOperationInterpreter()}

        #[actix_rt::main]
        async fn main() -> std::io::Result<()> {
            HttpServer::new(|| {
                App::new()
                    .data_factory(|| make_app_data())
                    .route("/", web::get().to(index))
            })
            .bind("0.0.0.0:8080")?
            .run()
            .await
        }

        async fn index(data: web::Data<AppData>) -> impl Responder {
            let mut state = vec![];
            return conduit_byte_code_interpreter(state, &data.executable).await;
        }

        async fn make_app_data() -> Result<AppData, ()> {
                        

            return Ok(AppData {
                ${app_data_adds.map(a => `${a.name}: ${a.initializer}`).join(",\n")}
            });
        }        
        `
        
}
