use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct InnerObj {
    name: String,
}


#[derive(Serialize, Deserialize)]
struct OuterObj {
    inner: InnerObj,
    title: String
}



#[actix_rt::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(index))
            .route("/ret", web::get().to(return_something))
            .route("/ingest", web::post().to(ingest_handler))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}



async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello world!")
}

async fn return_something() -> impl Responder {
    HttpResponse::Ok().json(InnerObj
     {
        name: "hello".to_string()
    })
}

async fn ingest_handler(input: web::Json<OuterObj>) -> impl Responder {
    HttpResponse::Ok().json(input.into_inner().inner)
}