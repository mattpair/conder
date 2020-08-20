import { OpDef, AllTypesMember } from './interpreter/derive_supported_ops';
import { WrittenCode } from './types';
import { CompiledTypes, Lexicon, Utilities} from 'conduit_parser';
import { cargolockstr, maindockerfile, cargo } from './constants';
import {generateInsertRustCode, generateRustGetAllQuerySpec, createSQLFor, generateQueryInterpreter} from './sql'
import { assertNever } from 'conduit_parser/dist/src/main/utils';
import { writeOperationInterpreter } from './interpreter/interpreter_writer';
import { WritableFunction } from './statement_converter';

function toRustType(p: CompiledTypes.ReturnType): string {
    if (p.kind === "VoidReturnType") {
        return "()"
    }
    return p.isArray ? `Vec<${p.val.name}>` : `${p.val.name}`
}

function toAnyType(p: CompiledTypes.RealType): string {
    if (p.isArray) {
        return `AnyType::Many${p.val.name}`
    }
    return `AnyType::${p.val.name}`
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

function writeFunction(f: WritableFunction): FunctionDef {
    const exec_name = `${f.name}_executable`
    const param = f.parameter.differentiate()
    const input: {param: string, extract: string} = param.kind === "NoParameter" ? 
    {param: "", extract: ""}
        :
    {
        param: `, input: web::Json<${toRustType(param.type)}>`, 
        extract: `
        state.push(${toAnyType(param.type)}(input.into_inner()));
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
    supportedOps: OpDef[],
    functions: WritableFunction[],
    allTypesUnion: AllTypesMember[]
}, WrittenCode> = {
    stepName: "writing deployment files",
    func: ({manifest, supportedOps, functions, allTypesUnion}) => {
        const structs: string[] = []
        const stores: Map<string, CompiledTypes.HierarchicalStore> = new Map()
        const f_defs: FunctionDef[] = functions.map(writeFunction)
        const app_data_adds: ConstDataAddition[] = []
        f_defs.forEach(f => app_data_adds.push(...f.allDataAdditions))

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
                            ${writeOperationInterpreter(supportedOps, allTypesUnion)}
                            // FUNCTIONS
                            ${f_defs.map(f => f.def).join("\n\n")}
                    
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
