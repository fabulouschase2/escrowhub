use actix_web::{post, get, web, HttpResponse, Responder};
use serde_json::json;
use uuid::Uuid;
use sqlx::{Pool, Sqlite, Row};

#[derive(Debug, serde::Deserialize)]
pub struct CreateRoom {
    pub deal_id: Uuid,
}

#[derive(Debug, serde::Serialize)]
pub struct RoomResponse {
    pub room_name: String,
    pub token: String,
    pub ws_url: String,
}

#[post("/video/room")]
async fn create_room(pool: web::Data<Pool<Sqlite>>, req: web::Json<CreateRoom>) -> impl Responder {
    let room_name = format!("deal-{}", req.deal_id);
    let token = format!("mock-token-{}", req.deal_id);
    let ws_url = std::env::var("LIVEKIT_URL").unwrap_or_else(|_| "ws://localhost:7880".to_string());

    HttpResponse::Ok().json(RoomResponse {
        room_name,
        token,
        ws_url,
    })
}

#[get("/video/room/{deal_id}")]
async fn get_room(pool: web::Data<Pool<Sqlite>>, deal_id: web::Path<String>) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "room_name": format!("deal-{}", deal_id),
        "ws_url": std::env::var("LIVEKIT_URL").unwrap_or_else(|_| "ws://localhost:7880".to_string())
    }))
}

#[post("/video/recording/{room_name}")]
async fn recording_webhook(pool: web::Data<Pool<Sqlite>>, webhook: web::Json<serde_json::Value>) -> impl Responder {
    eprintln!("Recording webhook: {:?}", webhook);
    HttpResponse::Ok().json(serde_json::json!({ "status": "received" }))
}

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create_room);
    cfg.service(get_room);
    cfg.service(recording_webhook);
}