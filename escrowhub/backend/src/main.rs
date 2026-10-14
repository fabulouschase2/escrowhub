use actix_web::{App, HttpServer, web, HttpResponse};

fn main() -> std::io::Result<()> {
    actix_web::rt::system::block_on(async {
        HttpServer::new(|| {
            App::new()
                .route("/health", web::get().to(|| async { HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })) }))
        })
        .bind(("127.0.0.1", 8080))?
        .run()
        .await
    })
}