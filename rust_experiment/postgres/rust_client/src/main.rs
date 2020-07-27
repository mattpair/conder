use tokio_postgres::{NoTls, Client};
use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use std::env;
use serde::{Deserialize, Serialize};


struct AppData {
    client: Client
}

#[derive(Serialize, Deserialize)]
struct City {
    name: String,
    location: i32
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
    let host = match env::var("POSTGRES_LOCATION") {
        Ok(pgloc) => pgloc,
        Err(e) => panic!("didn't receive POSTGRES_LOCATION: {}", e)
    };

    let (client, connection) = match tokio_postgres::connect(&format!("host={} user=postgres password=password", host), NoTls).await {
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