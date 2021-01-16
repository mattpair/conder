import { AnySchemaInstance } from './SchemaFactory';

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
    PRIVATE_PROCEDURES="PRIVATE_PROCEDURES",
    SCHEMAS="SCHEMAS",
    STORES="STORES",
    DEPLOYMENT_NAME="DEPLOYMENT_NAME",
    ETCD_URL="ETCD_URL",
    PUBLIC_KEY="PUBLIC_KEY",
    PRIVATE_KEY="PRIVATE_KEY"
}

export type EnvVarType<E extends Var> = 
E extends Var.STORES ? Record<string, AnySchemaInstance> :
E extends Var.SCHEMAS ? Record<string, AnySchemaInstance> :
E extends Var.PROCEDURES ? Record<string, AnyOpInstance[]> :
E extends Var.MONGO_CONNECTION_URI | Var.DEPLOYMENT_NAME | Var.ETCD_URL ? string :
E extends Var.PRIVATE_PROCEDURES ? string[] :
E extends Var.PRIVATE_KEY | Var.PUBLIC_KEY ? Uint8Array :
never

export type RequiredEnv = Var.SCHEMAS | Var.PROCEDURES | Var.STORES | Var.DEPLOYMENT_NAME | Var.PUBLIC_KEY | Var.PRIVATE_KEY

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
            name: "privateFns",
            type: "HashSet<String>",
            initializer: `match env::var("${Var.PRIVATE_PROCEDURES}") {
                Ok(str) => serde_json::from_str(&str).unwrap(),
                Err(e) => HashSet::with_capacity(0)
            }                
            ` 
        },
        {
            name: "schemas",
            type: "HashMap<String, Schema>",
            initializer: `match env::var("${Var.SCHEMAS}") {
                Ok(str) => serde_json::from_str(&str).unwrap(),
                Err(e) => {
                    eprintln!("Did not find any schemas {}", e);
                    HashMap::with_capacity(0)
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
            name: "lm_client",
            type: "Option<etcd_rs::Client>",
            initializer: `
            match env::var("${Var.ETCD_URL}") {
                Ok(r) => {
                    println!("Attempting to connect to etcd: {}", r);
                    match etcd_rs::Client::connect(etcd_rs::ClientConfig {
                        endpoints: vec![r],
                        auth: None,
                        tls: None,
                    }).await {
                        Ok(c) => {
                            let mut range_req = etcd_rs::RangeRequest::new(etcd_rs::KeyRange::all());
                            range_req.set_limit(1);
                            match c.kv().range(range_req).await {
                                Ok(e) => {},
                                Err(e) => panic!("Failure connecting to etcd: {}",e)
                            };
                            Some(c)
                        },
                        Err(e) => {
                            eprintln!("Failure connecting to etcd: {}",e);
                            None
                        }
                    }
                },
                Err(e) => None
            }
            `
        },
        {
            name: "private_key",
            type: "[u8; 64]",
            initializer: `
            match env::var("${Var.PRIVATE_KEY}") {
                Ok(some_str) => {
                    if some_str.len() != 64 * 3  - 1{
                        panic!("Unexpected string length");
                    }
                    let mut u8s: Vec<u8> = Vec::with_capacity(64);                    
                    for chunk in some_str.split_whitespace() {
                        u8s.push(u8::from_str_radix(chunk, 16).unwrap());
                    }
                    let conv: [u8; 64] = match u8s.try_into() {
                        Ok(r) => r,
                        Err(e) => panic!("Failure getting private key: {:?}", e)
                    };
                    conv
                },
                Err(e) => panic!("Private key could not be read")
            }
            `
        },
        {
            name: "public_key",
            type: "[u8; 32]",
            initializer: `
            match env::var("${Var.PUBLIC_KEY}") {
                Ok(some_str) => {
                    if some_str.len() != 32 * 3 - 1 {
                        panic!("Unexpected string length");
                    }
                    let mut u8s: Vec<u8> = Vec::with_capacity(32);                    
                    for chunk in some_str.split_whitespace() {
                        u8s.push(u8::from_str_radix(chunk, 16).unwrap());
                    }
                    let conv: [u8; 32] = match u8s.try_into() {
                        Ok(r) => r,
                        Err(e) => panic!("Failure getting public key: {:?}", e)
                    };
                    conv
                },
                Err(e) => panic!("Public key could not be read")
            }
            `
        },
        {
            name: "db",
            type: "Option<mongodb::Database>",
            initializer: `match env::var("${Var.MONGO_CONNECTION_URI}") {
                Ok(uri) => {
                    let mut options = mongodb::options::ClientOptions::parse(&uri).await.unwrap();
                    options.write_concern = Some(mongodb::options::WriteConcern::builder().w(mongodb::options::Acknowledgment::Majority).build());
                    options.read_concern = Some(mongodb::options::ReadConcern::majority());
                    let client = match mongodb::Client::with_options(options) {
                        Ok(r) => r,
                        Err(e) => panic!("Failure connecting to mongo: {}", e)
                    };
                    let deploymentname = env::var("${Var.DEPLOYMENT_NAME}").unwrap();

                    // List the names of the databases in that deployment.
                    let cols = match client.database(&deploymentname).list_collection_names(None).await {
                        Ok(r) => r,
                        Err(e) => panic!("Failure connecting to mongo: {}", e)
                    };
                    for col in  cols{
                        println!("{}", col);
                    }
                    Some(client.database(&deploymentname))
                },
                Err(e) => {
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
        use std::collections::HashSet;
        use std::future::Future;
        use awc;
        use std::borrow::Borrow;
        use bytes::Bytes;
        use mongodb::{Database};
        use std::convert::TryFrom;
        use std::convert::TryInto;
        use etcd_rs;
        use crypto::ed25519;
        use std::hash::{Hash, Hasher};
        use std::collections::hash_map::DefaultHasher;
        use futures::future::{BoxFuture, FutureExt};

        mod storage;
        mod locks;

        struct AppData {
            ${[app_data_adds.map(a => `${a.name}: ${a.type}`)].join(",\n")}
        }
        
        #[derive(Deserialize)]
        #[serde(tag = "kind", content= "data")]
        enum KernelRequest {
            Noop,
            Exec {proc: String, arg: Vec<InterpreterType>}
        }

        ${writeOperationInterpreter()}

        #[actix_rt::main]
        async fn main() -> std::io::Result<()> {
            let args: Vec<String> = env::args().collect();

            HttpServer::new(|| {
                App::new()
                    .data_factory(|| make_app_data())
                    .route("/", web::put().to(index))
                    .route("/{func_name}", web::get().to(get_func))
            })
            .bind(format!("0.0.0.0:{}", args[1]))?
            .run()
            .await
        }

        async fn process_req(req: KernelRequest, data: web::Data<AppData>) -> impl Responder {
            let g = Globals {
                schemas: &data.schemas,
                db: data.db.as_ref(),
                stores: &data.stores,
                fns: &data.procs,
                lm: data.lm_client.as_ref(),
                private_key: &data.private_key,
                public_key: &data.public_key
            };
            return match req {
                KernelRequest::Noop => conduit_byte_code_interpreter(vec![], &data.noop, g),
                KernelRequest::Exec{proc, arg} => match data.procs.get(&proc) {
                    Some(ops) => {
                        if data.privateFns.contains(&proc) {
                            eprintln!("Attempting to invoke a private function {}", &proc);
                            conduit_byte_code_interpreter(vec![], &data.noop, g)
                        }else {
                            conduit_byte_code_interpreter(arg, ops, g)
                        }
                    },
                    None => {
                        eprintln!("Invoking non-existent function {}", &proc);
                        conduit_byte_code_interpreter(vec![], &data.noop, g)
                    }                
                }
            }.await;
            
        }
        async fn get_func(data: web::Data<AppData>, path: web::Path<String>, q: web::Query<HashMap<String, InterpreterType>>) -> impl Responder {
            let func_name = path.into_inner();
            let args = q.into_inner();
            return process_req(KernelRequest::Exec{proc: func_name, arg: vec![InterpreterType::Object(args)]}, data).await;
        }


        async fn index(data: web::Data<AppData>, input: web::Json<KernelRequest>) -> impl Responder {    
            let req = input.into_inner();            
            return process_req(req, data).await;
        }

        async fn make_app_data() -> Result<AppData, ()> {
            return Ok(AppData {
                ${app_data_adds.map(a => `${a.name}: ${a.initializer}`).join(",\n")}
            });
        }
        `
        
}
