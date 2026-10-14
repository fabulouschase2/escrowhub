use actix_web::{post, web, HttpResponse, Responder};
use serde_json::json;
use crate::models::user::{RegisterUser, LoginUser, UserResponse, AuthResponse};

#[derive(Debug, Default)]
pub struct AppState {
    pub users: tokio::sync::Mutex<Vec<crate::models::user::User>>,
    pub deals: tokio::sync::Mutex<Vec<crate::models::deal::Deal>>,
    pub escrows: tokio::sync::Mutex<Vec<crate::models::escrow::Escrow>>,
    pub sessions: tokio::sync::Mutex<Vec<crate::models::live_session::LiveSession>>,
    pub disputes: tokio::sync::Mutex<Vec<crate::models::dispute::Dispute>>,
    pub ai_checks: tokio::sync::Mutex<Vec<crate::models::ai_check::AiCheck>>,
}

#[post("/auth/register")]
async fn register(data: web::Data<AppState>, req: web::Json<RegisterUser>) -> impl Responder {
    let users = data.users.lock().await;
    let id = uuid::Uuid::new_v4();
    let hashed = bcrypt::hash(&req.password, 12).expect("hash failed");
    let user = crate::models::user::User {
        id,
        email: req.email.clone(),
        wallet_address: req.wallet_address.clone(),
        hashed_password: Some(hashed),
        kyc_status: "none".to_string(),
        created_at: chrono::Utc::now(),
    };
    let users_mut = data.users.lock().await;
    users_mut.push(user.clone());
    
    let token = jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &jsonwebtoken::Claims {
            sub: id.to_string(),
            exp: chrono::Utc::now().timestamp() as usize + 86400,
        },
        &jsonwebtoken::EncodingKey::from_secret(
            std::env::var("JWT_SECRET").unwrap_or("secret").as_bytes(),
        ),
    ).unwrap();
    
    let resp = AuthResponse {
        token,
        user: UserResponse {
            id: user.id,
            email: user.email,
            wallet_address: user.wallet_address,
            kyc_status: user.kyc_status,
        },
    };
    HttpResponse::Ok().json(resp)
}

#[post("/auth/login")]
async fn login(data: web::Data<AppState>, req: web::Json<LoginUser>) -> impl Responder {
    let users = data.users.lock().await;
    let user = users.iter().find(|u| u.email == req.email);
    match user {
        Some(u) => {
            if bcrypt::verify(&req.password, &u.hashed_password.as_deref().unwrap_or("")).unwrap_or(false) {
                let token = jsonwebtoken::encode(
                    &jsonwebtoken::Header::default(),
                    &jsonwebtoken::Claims {
                        sub: u.id.to_string(),
                        exp: chrono::Utc::now().timestamp() as usize + 86400,
                    },
                    &jsonwebtoken::EncodingKey::from_secret(
                        std::env::var("JWT_SECRET").unwrap_or("secret").as_bytes(),
                    ),
                ).unwrap();
                let resp = AuthResponse {
                    token,
                    user: UserResponse {
                        id: u.id,
                        email: u.email.clone(),
                        wallet_address: u.wallet_address.clone(),
                        kyc_status: u.kyc_status.clone(),
                    },
                };
                HttpResponse::Ok().json(resp)
            } else {
                HttpResponse::Unauthorized().json(json!({ "error": "Invalid credentials" }))
            }
        }
        None => HttpResponse::Unauthorized().json(json!({ "error": "Invalid credentials" })),
    }
}

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(register);
    cfg.service(login);
}