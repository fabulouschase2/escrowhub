use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, HttpRequest};
use serde_json::json;
use std::sync::Mutex;

#[derive(Default)]
struct AppState {
    users: Mutex<Vec<serde_json::Value>>,
    deals: Mutex<Vec<serde_json::Value>>,
    escrows: Mutex<Vec<serde_json::Value>>,
    disputes: Mutex<Vec<serde_json::Value>>,
    ai_checks: Mutex<Vec<serde_json::Value>>,
}

/// Extract user ID from the "Authorization: Bearer jwt-{user_id}" header.
fn get_user_id_from_token(req: &HttpRequest) -> Option<String> {
    let auth = req.headers().get("Authorization")?.to_str().ok()?;
    let token = auth.strip_prefix("Bearer ")?;
    token.strip_prefix("jwt-").map(|s| s.to_string())
}

/// Look up a user's email by ID (for enriching deal responses).
fn email_for_user(state: &AppState, user_id: &str) -> Option<String> {
    let users = state.users.lock().unwrap();
    users
        .iter()
        .find(|u| u.get("id").and_then(|s| s.as_str()) == Some(user_id))
        .and_then(|u| u.get("email").and_then(|s| s.as_str()))
        .map(|s| s.to_string())
}

/// Resolve a seller identifier — user ID, email, or Solana wallet address —
/// to that user's ID, so deals always link to registered accounts.
fn resolve_user_id(state: &AppState, identifier: &str) -> Option<String> {
    let users = state.users.lock().unwrap();
    for u in users.iter() {
        let id = u.get("id").and_then(|s| s.as_str()).unwrap_or("");
        let email = u.get("email").and_then(|s| s.as_str()).unwrap_or("");
        let wallet = u.get("wallet_address").and_then(|s| s.as_str()).unwrap_or("");
        if identifier == id
            || (!email.is_empty() && identifier.eq_ignore_ascii_case(email))
            || (!wallet.is_empty() && identifier == wallet)
        {
            return Some(id.to_string());
        }
    }
    None
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({ "status": "ok" }))
}

async fn register(state: web::Data<AppState>, req: web::Json<serde_json::Value>) -> HttpResponse {
    let email = req.get("email").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let password = req.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let wallet = req.get("wallet_address").cloned();
    {
        let users = state.users.lock().unwrap();
        if users.iter().any(|u| u.get("email").and_then(|s| s.as_str()) == Some(&email)) {
            return HttpResponse::BadRequest().json(json!({ "error": "Email already registered" }));
        }
    }
    let hashed = bcrypt::hash(password, 10).unwrap_or_else(|_| "hashed".to_string());
    let id = uuid::Uuid::new_v4().to_string();
    let user = json!({ "id": id, "email": email, "wallet_address": wallet, "hashed_password": hashed, "kyc_status": "none", "created_at": chrono::Utc::now().to_rfc3339() });
    {
        let mut users = state.users.lock().unwrap();
        users.push(user);
    }
    HttpResponse::Ok().json(json!({ "token": format!("jwt-{}", id), "user": { "id": id, "email": email, "wallet_address": wallet, "kyc_status": "none" } }))
}

async fn login(state: web::Data<AppState>, req: web::Json<serde_json::Value>) -> HttpResponse {
    let email = req.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let password = req.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let users = state.users.lock().unwrap();
    let user = users.iter().find(|u| u.get("email").and_then(|s| s.as_str()) == Some(email));
    match user {
        Some(u) => {
            let valid = bcrypt::verify(password, u.get("hashed_password").and_then(|s| s.as_str()).unwrap_or("")).unwrap_or(false);
            if valid {
                let id = u.get("id").and_then(|s| s.as_str()).unwrap_or("").to_string();
                HttpResponse::Ok().json(json!({
                    "token": format!("jwt-{}", id),
                    "user": {
                        "id": id,
                        "email": u.get("email").and_then(|s| s.as_str()).unwrap_or(""),
                        "wallet_address": u.get("wallet_address").cloned(),
                        "kyc_status": u.get("kyc_status").and_then(|s| s.as_str()).unwrap_or("none")
                    }
                }))
            } else {
                HttpResponse::Unauthorized().json(json!({ "error": "Invalid credentials" }))
            }
        }
        None => HttpResponse::Unauthorized().json(json!({ "error": "Invalid credentials" })),
    }
}

async fn create_deal(state: web::Data<AppState>, req: web::Json<serde_json::Value>, http_req: HttpRequest) -> HttpResponse {
    // The buyer is whoever is authenticated via the Bearer token.
    let buyer_id = match get_user_id_from_token(&http_req) {
        Some(id) => id,
        None => return HttpResponse::Unauthorized().json(json!({ "error": "Authentication required to create a deal" })),
    };

    // The seller can be identified by email, wallet address, or user ID.
    let seller_input = req.get("seller_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let seller_id = match resolve_user_id(&state, &seller_input) {
        Some(id) => id,
        None => {
            return HttpResponse::BadRequest().json(json!({
                "error": "Seller not found. The seller must be a registered user — use their email, Solana wallet address, or user ID."
            }))
        }
    };

    let amount = req.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let currency = req.get("currency").and_then(|v| v.as_str()).unwrap_or("USDC").to_string();
    let platform_fee_pct = req.get("platform_fee_pct").and_then(|v| v.as_f64()).unwrap_or(10.0);
    let id = uuid::Uuid::new_v4().to_string();
    let deal = json!({
        "id": id, "buyer_id": buyer_id, "seller_id": seller_id,
        "amount": amount, "currency": currency, "platform_fee_pct": platform_fee_pct,
        "status": "created",
        "created_at": chrono::Utc::now().to_rfc3339(),
        "updated_at": chrono::Utc::now().to_rfc3339()
    });
    { let mut deals = state.deals.lock().unwrap(); deals.push(deal); }
    HttpResponse::Ok().json(json!({ "id": id, "status": "created" }))
}

async fn list_deals(state: web::Data<AppState>) -> HttpResponse {
    let deals = state.deals.lock().unwrap().clone();
    // Enrich each deal with buyer/seller emails so the UI can show
    // "You are the Buyer / Seller" and who the counterparty is.
    let enriched: Vec<serde_json::Value> = deals
        .iter()
        .map(|d| {
            let buyer_id = d.get("buyer_id").and_then(|s| s.as_str()).unwrap_or("");
            let seller_id = d.get("seller_id").and_then(|s| s.as_str()).unwrap_or("");
            let buyer_email = email_for_user(&state, buyer_id);
            let seller_email = email_for_user(&state, seller_id);
            let mut d = d.clone();
            d["buyer_email"] = json!(buyer_email);
            d["seller_email"] = json!(seller_email);
            d
        })
        .collect();
    HttpResponse::Ok().json(json!({ "deals": enriched }))
}

async fn get_deal(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let deals = state.deals.lock().unwrap();
    match deals.iter().find(|d| d.get("id").and_then(|s| s.as_str()) == Some(&**path)) {
        Some(d) => {
            let buyer_id = d.get("buyer_id").and_then(|s| s.as_str()).unwrap_or("");
            let seller_id = d.get("seller_id").and_then(|s| s.as_str()).unwrap_or("");
            let buyer_email = email_for_user(&state, buyer_id);
            let seller_email = email_for_user(&state, seller_id);
            let mut d = d.clone();
            d["buyer_email"] = json!(buyer_email);
            d["seller_email"] = json!(seller_email);
            HttpResponse::Ok().json(d)
        }
        None => HttpResponse::NotFound().json(json!({ "error": "Deal not found" })),
    }
}

async fn deposit_escrow(state: web::Data<AppState>, req: web::Json<serde_json::Value>) -> HttpResponse {
    let deal_id = req.get("deal_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let amount = req.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let token_mint = req.get("token_mint").and_then(|v| v.as_str()).unwrap_or("USDC").to_string();
    let sig = req.get("solana_tx_signature").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let escrow = json!({
        "id": id, "deal_id": deal_id, "amount": amount, "token_mint": token_mint,
        "escrow_state": "deposited", "solana_tx_signature": sig,
        "created_at": chrono::Utc::now().to_rfc3339()
    });
    {
        let mut escrows = state.escrows.lock().unwrap();
        escrows.push(escrow.clone());
    }
    {
        let mut deals = state.deals.lock().unwrap();
        if let Some(deal) = deals.iter_mut().find(|d| d.get("id").and_then(|s| s.as_str()) == Some(&deal_id)) {
            deal["status"] = json!("funded");
        }
    }
    HttpResponse::Ok().json(escrow)
}

async fn release_escrow(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let escrow_id = path.as_str();
    let mut escrows = state.escrows.lock().unwrap();
    match escrows.iter_mut().find(|e| e.get("id").and_then(|s| s.as_str()) == Some(escrow_id)) {
        Some(escrow) => {
            escrow["escrow_state"] = json!("released");
            HttpResponse::Ok().json(escrow.clone())
        }
        None => HttpResponse::NotFound().json(json!({ "error": "Escrow not found" })),
    }
}

async fn refund_escrow(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let escrow_id = path.as_str();
    let mut escrows = state.escrows.lock().unwrap();
    match escrows.iter_mut().find(|e| e.get("id").and_then(|s| s.as_str()) == Some(escrow_id)) {
        Some(escrow) => {
            escrow["escrow_state"] = json!("refunded");
            HttpResponse::Ok().json(escrow.clone())
        }
        None => HttpResponse::NotFound().json(json!({ "error": "Escrow not found" })),
    }
}

async fn create_room(req: web::Json<serde_json::Value>) -> HttpResponse {
    let deal_id = req.get("deal_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let room_name = format!("deal-{}", deal_id);
    let token = format!("mock-token-{}", deal_id);
    HttpResponse::Ok().json(json!({ "room_name": room_name, "token": token, "ws_url": "ws://localhost:7880" }))
}

async fn get_room(path: web::Path<String>) -> HttpResponse {
    let deal_id = path.as_str();
    HttpResponse::Ok().json(json!({ "room_name": format!("deal-{}", deal_id), "ws_url": "ws://localhost:7880" }))
}

async fn analyze_screenshot(state: web::Data<AppState>, req: web::Json<serde_json::Value>) -> HttpResponse {
    let session_id = req.get("session_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let screenshot_url = req.get("screenshot_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let analysis = json!({
        "milestone_reached": true,
        "confidence": 0.95,
        "details": "Account creation page detected with success indicator"
    });
    let id = uuid::Uuid::new_v4().to_string();
    let check = json!({
        "id": id, "session_id": session_id, "screenshot_url": screenshot_url,
        "analysis_result": analysis, "created_at": chrono::Utc::now().to_rfc3339()
    });
    {
        let mut checks = state.ai_checks.lock().unwrap();
        checks.push(check.clone());
    }
    HttpResponse::Ok().json(check)
}

async fn get_ai_checks(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let session_id = path.as_str();
    let checks = state.ai_checks.lock().unwrap();
    let filtered: Vec<_> = checks.iter()
        .filter(|c| c.get("session_id").and_then(|s| s.as_str()) == Some(session_id))
        .collect();
    HttpResponse::Ok().json(filtered)
}

async fn create_dispute(state: web::Data<AppState>, req: web::Json<serde_json::Value>) -> HttpResponse {
    let deal_id = req.get("deal_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let initiator_id = req.get("initiator_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let reason = req.get("reason").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let evidence_urls = req.get("evidence_urls").cloned().unwrap_or(json!([]));
    let id = uuid::Uuid::new_v4().to_string();
    let dispute = json!({
        "id": id, "deal_id": deal_id, "initiator_id": initiator_id, "reason": reason,
        "evidence_urls": evidence_urls,
        "created_at": chrono::Utc::now().to_rfc3339(),
        "resolved_at": null, "resolution": null
    });
    {
        let mut disputes = state.disputes.lock().unwrap();
        disputes.push(dispute.clone());
    }
    {
        let mut deals = state.deals.lock().unwrap();
        if let Some(deal) = deals.iter_mut().find(|d| d.get("id").and_then(|s| s.as_str()) == Some(&deal_id)) {
            deal["status"] = json!("disputed");
        }
    }
    HttpResponse::Ok().json(dispute)
}

async fn resolve_dispute(state: web::Data<AppState>, path: web::Path<String>, req: web::Json<serde_json::Value>) -> HttpResponse {
    let dispute_id = path.as_str();
    let resolution = req.get("resolution").and_then(|v| v.as_str()).unwrap_or("pending").to_string();
    let mut disputes = state.disputes.lock().unwrap();
    match disputes.iter_mut().find(|d| d.get("id").and_then(|s| s.as_str()) == Some(dispute_id)) {
        Some(dispute) => {
            dispute["resolution"] = json!(resolution);
            dispute["resolved_at"] = json!(chrono::Utc::now().to_rfc3339());
            let deal_id = dispute.get("deal_id").and_then(|s| s.as_str()).unwrap_or("").to_string();
            {
                let mut deals = state.deals.lock().unwrap();
                if let Some(deal) = deals.iter_mut().find(|d| d.get("id").and_then(|s| s.as_str()) == Some(&deal_id)) {
                    deal["status"] = json!("completed");
                }
            }
            HttpResponse::Ok().json(dispute.clone())
        }
        None => HttpResponse::NotFound().json(json!({ "error": "Dispute not found" })),
    }
}

async fn get_disputes(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let deal_id = path.as_str();
    let disputes = state.disputes.lock().unwrap();
    let filtered: Vec<_> = disputes.iter()
        .filter(|d| d.get("deal_id").and_then(|s| s.as_str()) == Some(deal_id))
        .collect();
    HttpResponse::Ok().json(filtered)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let state = web::Data::new(AppState::default());
    println!("EscrowHub backend running on http://127.0.0.1:8080");
    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("http://localhost:5000")
            .allowed_origin("http://127.0.0.1:5000")
            .allowed_origin("http://localhost:5173")
            .allowed_origin("http://127.0.0.1:5173")
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
            .allowed_headers(vec!["Content-Type", "Authorization"])
            .max_age(3600);
        App::new()
            .app_data(state.clone())
            .wrap(cors)
            .route("/health", web::get().to(health))
            .route("/auth/register", web::post().to(register))
            .route("/auth/login", web::post().to(login))
            .route("/deals", web::get().to(list_deals))
            .route("/deals", web::post().to(create_deal))
            .route("/deals/{id}", web::get().to(get_deal))
            .route("/escrow/deposit", web::post().to(deposit_escrow))
            .route("/escrow/release/{id}", web::post().to(release_escrow))
            .route("/escrow/refund/{id}", web::post().to(refund_escrow))
            .route("/video/room", web::post().to(create_room))
            .route("/video/room/{deal_id}", web::get().to(get_room))
            .route("/ai/analyze", web::post().to(analyze_screenshot))
            .route("/ai/checks/{session_id}", web::get().to(get_ai_checks))
            .route("/disputes", web::post().to(create_dispute))
            .route("/disputes/{dispute_id}/resolve", web::post().to(resolve_dispute))
            .route("/disputes/{deal_id}", web::get().to(get_disputes))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
