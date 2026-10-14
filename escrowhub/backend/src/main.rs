use actix_web::{post, web, HttpResponse, Responder, App, HttpServer};
use serde_json::json;

#[post("/auth/register")]
async fn register(_req: web::Json<serde_json::Value>) -> impl Responder {
    HttpResponse::Ok().json(json!({"message": "register", "token": "dummy_token"}))
}

#[post("/auth/login")]
async fn login(_req: web::Json<serde_json::Value>) -> impl Responder {
    HttpResponse::Ok().json(json!({"message": "login", "token": "dummy_token"}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .service(register)
            .service(login)
            .route("/health", web::get().to(|| async { HttpResponse::Ok().json(json!({"status": "ok"})) }))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}