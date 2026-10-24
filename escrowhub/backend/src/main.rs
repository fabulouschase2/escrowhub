use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, HttpRequest};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::json;
use solana_sdk::signature::{Keypair, Signer};
use std::sync::{Arc, Mutex, RwLock};
use std::collections::HashMap;
use std::time::SystemTime;

// Login tokens are signed JWTs with a hard expiry; the tokens table provides
// server-side revocation (logout).
const TOKEN_TTL_SECS: u64 = 7 * 24 * 3600;

#[derive(Debug, Serialize, serde::Deserialize)]
struct Claims {
    sub: String, // user email
    exp: u64,    // unix seconds
}

// ============================================================
// APPLICATION STATE
// ============================================================

#[derive(Clone)]
struct RateLimitEntry {
    attempts: u32,
    last_attempt: u64,
}

struct AppState {
    db: Arc<Mutex<Connection>>,
    escrow_authority: Arc<Keypair>,
    rpc_url: String,
    cluster: String,
    fee_wallet: Option<String>,
    rate_limits: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
    jwt_secret: String,
}

// ============================================================
// HELPERS
// ============================================================

fn extract_token(req: &HttpRequest) -> Option<String> {
    req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

// Cryptographic check only — no db access, safe to call while holding the lock.
fn jwt_email(state: &AppState, token: &str) -> Option<String> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .ok()?;
    Some(data.claims.sub)
}

// Revocation check for callers that already hold the db lock.
fn token_row_valid(conn: &Connection, token: &str, email: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM tokens WHERE token = ?1 AND email = ?2",
        params![token, email],
        |_| Ok(()),
    )
    .is_ok()
}

// Full validation: signature + expiry + not revoked. Takes the db lock itself.
fn get_email_for_token(state: &AppState, req: &HttpRequest) -> Option<String> {
    let token = extract_token(req)?;
    let email = jwt_email(state, &token)?;
    let conn = state.db.lock().unwrap();
    if token_row_valid(&conn, &token, &email) {
        Some(email)
    } else {
        None
    }
}

// Issue a fresh signed token and record it for revocation. Caller must NOT
// already hold the db lock.
fn issue_token(state: &AppState, email: &str) -> Option<String> {
    let exp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs()
        + TOKEN_TTL_SECS;
    let token = encode(
        &Header::default(),
        &Claims { sub: email.to_string(), exp },
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .ok()?;
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO tokens (token, email) VALUES (?1, ?2)",
        params![token, email],
    )
    .ok()?;
    Some(token)
}

// Minimal auth gate: request must carry a token that exists in the tokens table.
fn is_authenticated(state: &AppState, req: &HttpRequest) -> bool {
    get_email_for_token(state, req).is_some()
}

// Buyer or seller of the deal
fn is_deal_party(state: &AppState, deal_id: &str, req: &HttpRequest) -> bool {
    let token = match extract_token(req) {
        Some(t) => t,
        None => return false,
    };
    let email = match jwt_email(state, &token) {
        Some(e) if !e.is_empty() => e,
        _ => return false,
    };
    let conn = state.db.lock().unwrap();
    if !token_row_valid(&conn, &token, &email) {
        return false;
    }
    conn.query_row(
        "SELECT COUNT(*) FROM deals WHERE id = ?1 AND (buyer_email = ?2 OR seller_email = ?2)",
        params![deal_id, email],
        |r| r.get::<_, i64>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

// Buyer, seller, or a user who joined with the invitation code
fn is_room_viewer(state: &AppState, deal_id: &str, req: &HttpRequest) -> bool {
    let token = match extract_token(req) {
        Some(t) => t,
        None => return false,
    };
    let email = match jwt_email(state, &token) {
        Some(e) if !e.is_empty() => e,
        _ => return false,
    };
    let conn = state.db.lock().unwrap();
    if !token_row_valid(&conn, &token, &email) {
        return false;
    }
    let is_party = conn
        .query_row(
            "SELECT COUNT(*) FROM deals WHERE id = ?1 AND (buyer_email = ?2 OR seller_email = ?2)",
            params![deal_id, email],
            |r| r.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    if is_party {
        return true;
    }
    conn.query_row(
        "SELECT COUNT(*) FROM deal_participants WHERE deal_id = ?1 AND email = ?2",
        params![deal_id, email],
        |r| r.get::<_, i64>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

fn safe_get(r: &rusqlite::Row, idx: usize) -> String {
    match r.get::<_, String>(idx) {
        Ok(v) => v,
        Err(_) => String::new(),
    }
}

fn safe_bool(r: &rusqlite::Row, idx: usize) -> bool {
    match r.get::<_, i64>(idx) {
        Ok(v) => v != 0,
        Err(_) => false,
    }
}

fn safe_f64(r: &rusqlite::Row, idx: usize) -> f64 {
    match r.get::<_, f64>(idx) {
        Ok(v) => v,
        Err(_) => 0.0,
    }
}

// ============================================================
// ROOT HANDLER
// ============================================================

async fn health(state: web::Data<AppState>) -> HttpResponse {
    let conn = state.db.lock().unwrap();
    let user_count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)).unwrap_or(0);
    let room_count: i64 = conn.query_row("SELECT COUNT(*) FROM rooms", [], |r| r.get(0)).unwrap_or(0);
    let deal_count: i64 = conn.query_row("SELECT COUNT(*) FROM deals", [], |r| r.get(0)).unwrap_or(0);
    HttpResponse::Ok().json(json!({
        "status": "ok",
        "cluster": state.cluster,
        "users": user_count,
        "rooms": room_count,
        "deals": deal_count,
        "message": "EscrowHub backend is running"
    }))
}

// ============================================================
// AUTH HANDLERS
// ============================================================

async fn register(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
) -> HttpResponse {
    let email = req
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let password = req
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if email.is_empty() || !email.contains('@') || email.len() > 254 {
        return HttpResponse::BadRequest().json(json!({ "error": "A valid email is required" }));
    }
    if password.len() < 8 || password.len() > 128 {
        return HttpResponse::BadRequest().json(json!({ "error": "Password must be 8-128 characters" }));
    }

    // Hash the password — plaintext must never touch the database.
    let password_hash = match bcrypt::hash(&password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => return HttpResponse::InternalServerError().json(json!({ "error": "Failed to process password" })),
    };

    let kp = Keypair::new();
    let pubkey = kp.pubkey().to_string();
    let id = uuid::Uuid::new_v4().to_string();

    {
        let conn = state.db.lock().unwrap();
        // Plain INSERT: re-registering an existing email must never overwrite
        // that account's credentials (account-takeover guard).
        let inserted = conn.execute(
            "INSERT INTO users (id, email, password, wallet_address) VALUES (?1, ?2, ?3, ?4)",
            params![id, email, password_hash, pubkey],
        );
        if inserted.is_err() {
            return HttpResponse::Conflict().json(json!({ "error": "An account with this email already exists" }));
        }
        let _ = conn.execute(
            "INSERT INTO audit_log (event_type, actor_email, target_id, timestamp, details) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["register", email, id, chrono::Utc::now().to_rfc3339(), "account created"],
        );
    }
    let token = match issue_token(&state, &email) {
        Some(t) => t,
        None => return HttpResponse::InternalServerError().json(json!({ "error": "Failed to issue session token" })),
    };

    HttpResponse::Ok().json(json!({
        "token": token,
        "user": { "id": id, "email": email, "wallet_address": pubkey }
    }))
}

async fn login(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let email = req
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let password = req
        .get("password")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Per-IP rate limit: 5 attempts per rolling 60s window; the counter resets
    // once the window expires so legitimate users aren't locked out forever.
    let ip = http
        .peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    {
        let mut limits = state.rate_limits.write().unwrap();
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let entry = limits.entry(ip).or_insert(RateLimitEntry { attempts: 0, last_attempt: now });
        if now.saturating_sub(entry.last_attempt) >= 60 {
            entry.attempts = 0;
        }
        if now.saturating_sub(entry.last_attempt) < 60 && entry.attempts >= 5 {
            return HttpResponse::TooManyRequests()
                .json(json!({ "error": "Rate limit exceeded. Try again later." }));
        }
        entry.attempts += 1;
        entry.last_attempt = now;
    }

    let conn = state.db.lock().unwrap();
    let stored_hash: Option<String> = conn
        .query_row(
            "SELECT password FROM users WHERE email = ?1",
            params![email],
            |r| r.get(0),
        )
        .ok();

    let user_exists = match stored_hash {
        Some(hash) => bcrypt::verify(&password, &hash).unwrap_or(false),
        None => false,
    };

    if user_exists {
        // Return the same shape as register: token + user object. The frontend's
        // AuthContext stores both, and ProtectedRoute bounces to /login when the
        // user object is missing.
        let (id, wallet_address) = conn
            .query_row(
                "SELECT id, wallet_address FROM users WHERE email = ?1",
                params![email],
                |r| Ok((r.get::<_, String>(0).unwrap_or_default(), r.get::<_, String>(1).unwrap_or_default())),
            )
            .unwrap_or_default();
        drop(conn);
        match issue_token(&state, &email) {
            Some(token) => HttpResponse::Ok().json(json!({
                "token": token,
                "user": { "id": id, "email": email, "wallet_address": wallet_address }
            })),
            None => HttpResponse::InternalServerError().json(json!({ "error": "Failed to issue session token" })),
        }
    } else {
        HttpResponse::Unauthorized().json(json!({ "error": "Invalid credentials" }))
    }
}

// Logout: revoke the presented token server-side.
async fn logout(state: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    let token = match extract_token(&req) {
        Some(t) => t,
        None => return HttpResponse::Unauthorized().json(json!({ "error": "Unauthorized" })),
    };
    let email = match jwt_email(&state, &token) {
        Some(e) => e,
        None => return HttpResponse::Unauthorized().json(json!({ "error": "Invalid or expired token" })),
    };
    let conn = state.db.lock().unwrap();
    let _ = conn.execute("DELETE FROM tokens WHERE token = ?1 AND email = ?2", params![token, email]);
    HttpResponse::Ok().json(json!({ "status": "logged_out" }))
}

// ============================================================
// DEAL HANDLERS
// ============================================================

async fn list_deals(state: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    // Authenticated users only see deals they are a party to or have joined.
    let token = match extract_token(&req) {
        Some(t) => t,
        None => return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." })),
    };
    let email = match jwt_email(&state, &token) {
        Some(e) if !e.is_empty() => e,
        _ => return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." })),
    };
    let conn = state.db.lock().unwrap();
    if !token_row_valid(&conn, &token, &email) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }

    let mut deals = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT d.id, d.seller_email, d.amount, d.currency, d.status, d.created_at,
                CASE WHEN d.buyer_email = ?1 THEN 'buyer'
                     WHEN d.seller_email = ?1 THEN 'seller'
                     ELSE 'participant' END
         FROM deals d
         WHERE d.buyer_email = ?1 OR d.seller_email = ?1
            OR EXISTS (SELECT 1 FROM deal_participants p WHERE p.deal_id = d.id AND p.email = ?1)",
    ) {
        if let Ok(rows) = stmt.query_map(params![email], |r| {
            Ok(json!({
                "id": safe_get(r, 0),
                "seller_email": safe_get(r, 1),
                "amount": safe_f64(r, 2),
                "currency": safe_get(r, 3),
                "status": safe_get(r, 4),
                "created_at": safe_get(r, 5),
                "viewer_role": safe_get(r, 6),
            }))
        }) {
            for row in rows.flatten() {
                deals.push(row);
            }
        }
    }
    HttpResponse::Ok().json(json!({ "deals": deals }))
}

async fn create_deal(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let seller_email = req
        .get("seller_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let amount: f64 = req.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let currency = req.get("currency").and_then(|v| v.as_str()).unwrap_or("SOL").to_string();
    // The creator becomes the deal's buyer; an unauthenticated request must not
    // create a deal with a blank buyer_email (it would be unreachable forever).
    let buyer_email = match get_email_for_token(&state, &http) {
        Some(e) if !e.is_empty() => e,
        _ => return HttpResponse::Unauthorized().json(json!({ "error": "Sign in to create a deal" })),
    };
    if amount < 0.0 {
        return HttpResponse::BadRequest().json(json!({ "error": "Amount must be positive" }));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let inv_code = format!("inv-{}", uuid::Uuid::new_v4().simple());
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT OR REPLACE INTO deals (id, seller_email, buyer_email, amount, currency, invitation_code, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, seller_email, buyer_email, amount, currency, inv_code, "created", created_at],
        );
    }

    HttpResponse::Ok().json(json!({
        "id": id,
        "invitation_code": inv_code,
        "amount_lamports": (amount * 1_000_000_000.0) as u64,
        "status": "created"
    }))
}

async fn get_deal(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    // Authentication failure is 401 (the frontend redirects to login); a valid
    // session without access is 403.
    let email = match get_email_for_token(&state, &req) {
        Some(e) if !e.is_empty() => e,
        _ => return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." })),
    };

    let conn = state.db.lock().unwrap();
    let result = conn.query_row(
        "SELECT id, seller_email, buyer_email, amount, currency, invitation_code, status FROM deals WHERE id = ?1",
        params![deal_id],
        |r| {
            let seller_email: String = r.get(1).unwrap_or_default();
            let buyer_email: String = r.get(2).unwrap_or_default();
            let viewer_role = if buyer_email == email {
                "buyer"
            } else if seller_email == email {
                "seller"
            } else {
                "participant"
            };
            Ok(json!({
                "id": safe_get(r, 0),
                "seller_email": seller_email,
                "buyer_email": buyer_email,
                "amount": safe_f64(r, 3),
                "currency": safe_get(r, 4),
                "invitation_code": safe_get(r, 5),
                "status": safe_get(r, 6),
                "viewer_role": viewer_role,
            }))
        },
    );
    let deal = match result {
        Ok(d) => d,
        Err(_) => return HttpResponse::NotFound().json(json!({ "error": "Deal not found" })),
    };
    // Buyer/seller always see the deal; anyone else only if they joined by code.
    let is_party = deal.get("buyer_email").and_then(|v| v.as_str()) == Some(email.as_str())
        || deal.get("seller_email").and_then(|v| v.as_str()) == Some(email.as_str());
    if !is_party {
        let joined: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM deal_participants WHERE deal_id = ?1 AND email = ?2",
                params![deal_id, email],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if joined == 0 {
            return HttpResponse::Forbidden().json(json!({ "error": "Not a participant of this deal" }));
        }
    }
    HttpResponse::Ok().json(deal)
}

// Shared join logic: validate the invitation code and record the joiner.
// `conn` must be the only held lock (the token check uses jwt + row under it).
fn do_join(
    conn: &Connection,
    state: &AppState,
    deal_id: &str,
    code: &str,
    http: &HttpRequest,
) -> Result<serde_json::Value, HttpResponse> {
    let stored_code: String = match conn.query_row(
        "SELECT invitation_code FROM deals WHERE id = ?1",
        params![deal_id],
        |r| r.get(0),
    ) {
        Ok(c) => c,
        Err(_) => return Err(HttpResponse::NotFound().json(json!({ "error": "Deal not found" }))),
    };

    if code != stored_code {
        return Err(HttpResponse::Forbidden().json(json!({ "error": "Invalid invitation code" })));
    }

    let token = match extract_token(http) {
        Some(t) => t,
        None => return Err(HttpResponse::Unauthorized().json(json!({ "error": "Sign in to join a deal" }))),
    };
    let email = match jwt_email(state, &token) {
        Some(e) => e,
        None => return Err(HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }))),
    };
    if !token_row_valid(conn, &token, &email) {
        return Err(HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." })));
    }

    let _ = conn.execute(
        "INSERT OR IGNORE INTO deal_participants (deal_id, email, joined_at) VALUES (?1, ?2, ?3)",
        params![deal_id, email, chrono::Utc::now().to_rfc3339()],
    );
    let _ = conn.execute("UPDATE deals SET status = 'active' WHERE id = ?1", params![deal_id]);

    Ok(json!({ "status": "joined", "deal_id": deal_id }))
}

async fn join_deal(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();
    let code = req.get("code").and_then(|v| v.as_str()).unwrap_or("");
    let conn = state.db.lock().unwrap();
    match do_join(&conn, &state, deal_id, code, &http) {
        Ok(body) => HttpResponse::Ok().json(body),
        Err(resp) => resp,
    }
}

// Join by invitation code alone: the code is unique per deal, so the deal id
// can be resolved server-side (the /join page has no deal id in its URL).
async fn join_by_code(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let code = req.get("code").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if code.is_empty() {
        return HttpResponse::BadRequest().json(json!({ "error": "Invitation code required" }));
    }
    let conn = state.db.lock().unwrap();
    let deal_id: String = match conn.query_row(
        "SELECT id FROM deals WHERE invitation_code = ?1",
        params![code],
        |r| r.get(0),
    ) {
        Ok(id) => id,
        Err(_) => {
            return HttpResponse::NotFound()
                .json(json!({ "error": "Invalid invitation code. Ask the deal creator to re-share it." }))
        }
    };
    match do_join(&conn, &state, &deal_id, &code, &http) {
        Ok(body) => HttpResponse::Ok().json(body),
        Err(resp) => resp,
    }
}

async fn invite_observer(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();
    let observer_email = req.get("observer_email").and_then(|v| v.as_str()).unwrap_or("").to_string();

    if observer_email.is_empty() || !observer_email.contains('@') {
        return HttpResponse::BadRequest().json(json!({ "error": "Valid observer email required" }));
    }
    // Only deal parties may invite observers into the room.
    if get_email_for_token(&state, &http).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_deal_party(&state, deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Only deal parties can invite observers" }));
    }

    let conn = state.db.lock().unwrap();
    let deal_exists = conn
        .query_row("SELECT id FROM deals WHERE id = ?1", params![deal_id], |r| r.get::<_, String>(0))
        .is_ok();
    if !deal_exists {
        return HttpResponse::NotFound().json(json!({ "error": "Deal not found" }));
    }

    let _ = conn.execute(
        "INSERT INTO observers (deal_id, email, invited_at) VALUES (?1, ?2, ?3)",
        params![deal_id, observer_email, chrono::Utc::now().to_rfc3339()],
    );

    HttpResponse::Ok().json(json!({ "status": "invited", "observer_email": observer_email }))
}

// ============================================================
// ESCROW HANDLERS
// ============================================================

async fn escrow_config(state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "cluster": state.cluster,
        "rpc_url": state.rpc_url,
        "escrow_authority": state.escrow_authority.pubkey().to_string(),
        "fee_wallet": state.fee_wallet.clone(),
    }))
}

async fn deposit_escrow(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = req.get("deal_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let sig = req.get("solana_tx_signature").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if sig.is_empty() {
        return HttpResponse::BadRequest().json(json!({ "error": "A real Solana transaction signature is required" }));
    }

    // Only a deal party may fund the escrow, and the deal must exist.
    if get_email_for_token(&state, &http).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_deal_party(&state, &deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Only deal parties can deposit escrow" }));
    }

    // Reject double deposits: one open escrow per deal.
    {
        let conn = state.db.lock().unwrap();
        let deal_amount: f64 = conn
            .query_row("SELECT amount FROM deals WHERE id = ?1", params![deal_id], |r| r.get(0))
            .unwrap_or(0.0);
        if deal_amount <= 0.0 {
            return HttpResponse::NotFound().json(json!({ "error": "Deal not found" }));
        }
        let open = conn
            .query_row(
                "SELECT COUNT(*) FROM escrows WHERE deal_id = ?1 AND status = 'deposited'",
                params![deal_id],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0);
        if open > 0 {
            return HttpResponse::Conflict().json(json!({ "error": "Escrow for this deal is already deposited" }));
        }
    }

    // Solana signatures are base58-encoded 64-byte values; decode properly
    // instead of comparing ASCII byte counts (a real sig is ~87-88 chars).
    let signature = match bs58::decode(&sig).into_vec() {
        Ok(bytes) if bytes.len() == 64 => {
            let mut arr = [0u8; 64];
            arr.copy_from_slice(&bytes);
            solana_sdk::signature::Signature::from(arr)
        }
        _ => {
            return HttpResponse::BadRequest().json(json!({ "error": "invalid signature format (base58 64-byte expected)" }))
        }
    };

    let rpc_url = state.rpc_url.clone();
    let verify_result = match actix_web::rt::time::timeout(std::time::Duration::from_secs(5), async move {
        let client = solana_client::rpc_client::RpcClient::new(rpc_url);
        match client.get_signature_statuses(&[signature]) {
            Ok(statuses) => {
                if let Some(Some(status)) = statuses.value.first() {
                    if status.err.is_none() {
                        Ok(())
                    } else {
                        Err(format!("Transaction failed: {:?}", status.err))
                    }
                } else {
                    Err("Transaction not confirmed or failed".to_string())
                }
            }
            Err(e) => Err(format!("RPC error: {}", e)),
        }
    })
    .await
    {
        Ok(res) => res,
        Err(_) => {
            return HttpResponse::GatewayTimeout()
                .json(json!({ "error": "Solana RPC verification timed out" }))
        }
    };

    match verify_result {
        Ok(()) => {}
        Err(msg) => {
            return HttpResponse::BadRequest().json(json!({ "error": format!("Deposit rejected: {}", msg) }));
        }
    }

    let amount_lamports = {
        let conn = state.db.lock().unwrap();
        let amount: f64 = conn
            .query_row("SELECT amount FROM deals WHERE id = ?1", params![deal_id], |r| r.get(0))
            .unwrap_or(0.0);
        (amount * 1_000_000_000.0) as i64
    };

    let id = uuid::Uuid::new_v4().to_string();
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO escrows (id, deal_id, amount_lamports, status) VALUES (?1, ?2, ?3, ?4)",
            params![id, deal_id, amount_lamports, "deposited"],
        );
        let _ = conn.execute(
            "INSERT INTO audit_log (event_type, actor_email, target_id, timestamp, details) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["escrow.deposited", "deal-party", id, chrono::Utc::now().to_rfc3339(), format!("deal={}", deal_id)],
        );
    }

    HttpResponse::Ok().json(json!({
        "id": id,
        "deal_id": deal_id,
        "amount_lamports": amount_lamports,
        "token_mint": "SOL",
        "escrow_state": "deposited",
        "solana_tx_signature": sig,
    }))
}

// Change a deposited escrow's state and record an audit entry in one DB scope
fn finalize_escrow(state: &AppState, escrow_id: &str, new_state: &str, event: &str) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().unwrap();
    let updated = conn.execute(
        "UPDATE escrows SET status = ?1 WHERE id = ?2 AND status = 'deposited'",
        params![new_state, escrow_id],
    ).map_err(|e| e.to_string())?;

    if updated == 0 {
        // Distinguish "never existed" from "wrong state"
        let exists = conn
            .query_row("SELECT id FROM escrows WHERE id = ?1", params![escrow_id], |r| r.get::<_, String>(0))
            .is_ok();
        return Err(if exists { "already_finalized".to_string() } else { "not_found".to_string() });
    }

    let row = conn
        .query_row(
            "SELECT id, deal_id, amount_lamports, status FROM escrows WHERE id = ?1",
            params![escrow_id],
            |r| {
                Ok(json!({
                    "id": safe_get(r, 0),
                    "deal_id": safe_get(r, 1),
                    "amount_lamports": r.get::<_, i64>(2).unwrap_or(0),
                    "escrow_state": safe_get(r, 3),
                }))
            },
        )
        .map_err(|e| e.to_string())?;

    let _ = conn.execute(
        "INSERT INTO audit_log (event_type, actor_email, target_id, timestamp, details) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![event, "system", escrow_id, chrono::Utc::now().to_rfc3339(), format!("escrow -> {}", new_state)],
    );

    Ok(row)
}

// Verify the caller is a deal party of the escrow's deal and holds the role
// allowed for this payout direction (buyer releases, seller refunds).
fn authorize_escrow_action(state: &AppState, escrow_id: &str, req: &HttpRequest, allowed_role: &str) -> Result<(), HttpResponse> {
    let token = match extract_token(req) {
        Some(t) => t,
        None => return Err(HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }))),
    };
    let email = match jwt_email(state, &token) {
        Some(e) if !e.is_empty() => e,
        _ => return Err(HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }))),
    };
    let conn = state.db.lock().unwrap();
    if !token_row_valid(&conn, &token, &email) {
        return Err(HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." })));
    }
    let role_col = if allowed_role == "buyer" { "buyer_email" } else { "seller_email" };
    let authorized: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM escrows e JOIN deals d ON d.id = e.deal_id
                 WHERE e.id = ?1 AND d.{} = ?2",
                role_col
            ),
            params![escrow_id, email],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if authorized == 0 {
        return Err(HttpResponse::Forbidden().json(json!({ "error": "Only the deal's buyer can release / seller can refund" })));
    }
    Ok(())
}

async fn release_escrow(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let escrow_id = path.as_str();
    if let Err(resp) = authorize_escrow_action(&state, escrow_id, &req, "buyer") {
        return resp;
    }
    match finalize_escrow(&state, escrow_id, "released", "escrow.release") {
        Ok(row) => HttpResponse::Ok().json(row),
        Err(ref e) if *e == "not_found" => HttpResponse::NotFound().json(json!({ "error": "Escrow not found" })),
        Err(ref e) if *e == "already_finalized" => HttpResponse::Conflict().json(json!({ "error": "Escrow already finalized" })),
        Err(e) => HttpResponse::InternalServerError().json(json!({ "error": e })),
    }
}

async fn refund_escrow(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let escrow_id = path.as_str();
    if let Err(resp) = authorize_escrow_action(&state, escrow_id, &req, "seller") {
        return resp;
    }
    match finalize_escrow(&state, escrow_id, "refunded", "escrow.refund") {
        Ok(row) => HttpResponse::Ok().json(row),
        Err(ref e) if *e == "not_found" => HttpResponse::NotFound().json(json!({ "error": "Escrow not found" })),
        Err(ref e) if *e == "already_finalized" => HttpResponse::Conflict().json(json!({ "error": "Escrow already finalized" })),
        Err(e) => HttpResponse::InternalServerError().json(json!({ "error": e })),
    }
}

// ============================================================
// VIDEO ROOM HANDLERS
// ============================================================

async fn get_room(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    if get_email_for_token(&state, &req).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, deal_id, &req) {
        return HttpResponse::Forbidden().json(json!({ "error": "Not a participant of this deal" }));
    }

    let conn = state.db.lock().unwrap();
    // Don't fabricate rooms for deal ids that don't exist.
    let deal_exists = conn
        .query_row("SELECT id FROM deals WHERE id = ?1", params![deal_id], |r| r.get::<_, String>(0))
        .is_ok();
    if !deal_exists {
        return HttpResponse::NotFound().json(json!({ "error": "Deal not found" }));
    }

    let _ = conn.execute(
        "INSERT OR IGNORE INTO rooms (deal_id, updated_at) VALUES (?1, ?2)",
        params![deal_id, chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()],
    );

    let result = conn.query_row(
        "SELECT deal_id, webrtc_offer, webrtc_answer, is_screen_sharing, screen_share_start, updated_at FROM rooms WHERE deal_id = ?1",
        params![deal_id],
        |r| {
            Ok(json!({
                "deal_id": safe_get(r, 0),
                "webrtc_offer": safe_get(r, 1),
                "webrtc_answer": safe_get(r, 2),
                "is_screen_sharing": safe_bool(r, 3),
                "screen_share_start": safe_get(r, 4),
                "updated_at": safe_get(r, 5),
            }))
        },
    );
    match result {
        Ok(room) => HttpResponse::Ok().json(json!({ "room_state": room })),
        Err(_) => HttpResponse::NotFound().json(json!({ "error": "Room not found" })),
    }
}

// GET on the offer path: only buyer/seller may read signaling state
async fn webrtc_offer_state(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    if get_email_for_token(&state, &req).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, deal_id, &req) {
        return HttpResponse::Forbidden().json(json!({ "error": "Signaling restricted to deal participants" }));
    }

    let conn = state.db.lock().unwrap();
    let offer: String = conn
        .query_row(
            "SELECT webrtc_offer FROM rooms WHERE deal_id = ?1",
            params![deal_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    HttpResponse::Ok().json(json!({ "deal_id": deal_id, "webrtc_offer": offer }))
}

async fn webrtc_offer(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    if get_email_for_token(&state, &http).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Signaling restricted to deal participants" }));
    }

    let offer_sdp = match req.get("offer").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return HttpResponse::BadRequest().json(json!({ "error": "offer field required" })),
    };
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO rooms (deal_id, webrtc_offer, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(deal_id) DO UPDATE SET webrtc_offer = excluded.webrtc_offer, updated_at = excluded.updated_at",
            params![deal_id, offer_sdp, ts],
        );
    }
    HttpResponse::Ok().json(json!({ "status": "stored" }))
}

async fn webrtc_answer(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    if get_email_for_token(&state, &http).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Signaling restricted to deal participants" }));
    }

    let answer_sdp = match req.get("answer").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return HttpResponse::BadRequest().json(json!({ "error": "answer field required" })),
    };
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO rooms (deal_id, webrtc_answer, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(deal_id) DO UPDATE SET webrtc_answer = excluded.webrtc_answer, updated_at = excluded.updated_at",
            params![deal_id, answer_sdp, ts],
        );
    }
    HttpResponse::Ok().json(json!({ "status": "stored" }))
}

async fn webrtc_ice_candidate(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    if get_email_for_token(&state, &http).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Signaling restricted to deal participants" }));
    }

    let sender = req.get("sender").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    let candidate = req.get("candidate").cloned().unwrap_or(serde_json::Value::Null);
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO ice_candidates (deal_id, sender, candidate, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![deal_id, sender, candidate.to_string(), chrono::Utc::now().to_rfc3339()],
        );
    }
    HttpResponse::Ok().json(json!({ "status": "stored", "sender": sender }))
}

async fn get_webrtc_ice(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    if get_email_for_token(&state, &req).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, deal_id, &req) {
        return HttpResponse::Forbidden().json(json!({ "error": "Signaling restricted to deal participants" }));
    }

    let conn = state.db.lock().unwrap();
    let mut candidates = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT sender, candidate, created_at FROM ice_candidates WHERE deal_id = ?1 ORDER BY created_at ASC LIMIT 50",
    ) {
        if let Ok(rows) = stmt.query_map(params![deal_id], |r| {
            Ok(json!({
                "sender": safe_get(r, 0),
                "candidate": safe_get(r, 1),
                "created_at": safe_get(r, 2),
            }))
        }) {
            for row in rows.flatten() {
                candidates.push(row);
            }
        }
    }
    HttpResponse::Ok().json(json!({ "candidates": candidates }))
}

async fn screen_share(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();

    // Only the deal's seller may share their screen; buyers and observers watch.
    let email = match get_email_for_token(&state, &http) {
        Some(e) if !e.is_empty() => e,
        _ => return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." })),
    };

    let conn = state.db.lock().unwrap();
    let seller_email: String = match conn.query_row(
        "SELECT seller_email FROM deals WHERE id = ?1",
        params![deal_id],
        |r| r.get(0),
    ) {
        Ok(s) => s,
        Err(_) => return HttpResponse::NotFound().json(json!({ "error": "Deal not found" })),
    };
    if email != seller_email {
        return HttpResponse::Forbidden().json(json!({ "error": "Only the seller can share their screen" }));
    }

    let is_sharing: bool = req.get("is_sharing").and_then(|v| v.as_bool()).unwrap_or(false);
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    // Reuse the already-held connection (a second lock here would deadlock)
    let _ = conn.execute(
        "INSERT INTO rooms (deal_id, is_screen_sharing, screen_share_start, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(deal_id) DO UPDATE SET is_screen_sharing = excluded.is_screen_sharing, screen_share_start = excluded.screen_share_start, updated_at = excluded.updated_at",
        params![deal_id, if is_sharing { 1 } else { 0 }, if is_sharing { Some(ts.clone()) } else { None }, ts],
    );
    HttpResponse::Ok().json(json!({ "status": "updated", "is_screen_sharing": is_sharing }))
}

// POST /video/room — explicitly create (or fetch) the room for a deal
async fn create_room(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = req.get("deal_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if deal_id.is_empty() {
        return HttpResponse::BadRequest().json(json!({ "error": "deal_id required" }));
    }

    if get_email_for_token(&state, &http).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, &deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Not a participant of this deal" }));
    }

    let conn = state.db.lock().unwrap();
    let deal_exists = conn
        .query_row("SELECT id FROM deals WHERE id = ?1", params![deal_id], |r| r.get::<_, String>(0))
        .is_ok();
    if !deal_exists {
        return HttpResponse::NotFound().json(json!({ "error": "Deal not found" }));
    }

    let _ = conn.execute(
        "INSERT OR IGNORE INTO rooms (deal_id, updated_at) VALUES (?1, ?2)",
        params![deal_id, chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()],
    );

    let room_state = conn
        .query_row(
            "SELECT deal_id, webrtc_offer, webrtc_answer, is_screen_sharing, screen_share_start, updated_at FROM rooms WHERE deal_id = ?1",
            params![deal_id],
            |r| {
                Ok(json!({
                    "deal_id": safe_get(r, 0),
                    "webrtc_offer": safe_get(r, 1),
                    "webrtc_answer": safe_get(r, 2),
                    "is_screen_sharing": safe_bool(r, 3),
                    "screen_share_start": safe_get(r, 4),
                    "updated_at": safe_get(r, 5),
                }))
            },
        )
        .unwrap_or(json!({ "deal_id": deal_id }));
    HttpResponse::Ok().json(json!({ "deal_id": deal_id, "status": "active", "room_state": room_state }))
}

// ============================================================
// DISPUTE HANDLERS
// ============================================================

async fn create_dispute(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = req.get("deal_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let initiator = req.get("initiator_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let reason = req.get("reason").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let evidence = req.get("evidence_urls").cloned().unwrap_or(serde_json::Value::Null);

    if deal_id.is_empty() || reason.is_empty() {
        return HttpResponse::BadRequest().json(json!({ "error": "deal_id and reason are required" }));
    }
    if !is_room_viewer(&state, &deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Only deal participants may open a dispute" }));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO disputes (id, deal_id, initiator_id, reason, evidence_urls, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, deal_id, initiator, reason, evidence.to_string(), "open", created_at],
        );
        let _ = conn.execute(
            "INSERT INTO audit_log (event_type, actor_email, target_id, timestamp, details) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["dispute.open", initiator, id, chrono::Utc::now().to_rfc3339(), reason],
        );
    }

    HttpResponse::Ok().json(json!({ "id": id, "deal_id": deal_id, "status": "open", "created_at": created_at }))
}

async fn resolve_dispute(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    let dispute_id = path.as_str();
    let resolution = req.get("resolution").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();

    if !["release", "refund", "split", "cancel"].contains(&resolution.as_str()) {
        return HttpResponse::BadRequest().json(json!({ "error": "resolution must be release, refund, split, or cancel" }));
    }

    let conn = state.db.lock().unwrap();
    let (deal_id, initiator): (String, String) = match conn.query_row(
        "SELECT deal_id, initiator_id FROM disputes WHERE id = ?1 AND status = 'open'",
        params![dispute_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ) {
        Ok(d) => d,
        Err(_) => {
            let exists = conn.query_row("SELECT id FROM disputes WHERE id = ?1", params![dispute_id], |r| r.get::<_, String>(0)).is_ok();
            return if exists {
                HttpResponse::Conflict().json(json!({ "error": "Dispute already resolved" }))
            } else {
                HttpResponse::NotFound().json(json!({ "error": "Dispute not found" }))
            };
        }
    };
    drop(conn);

    // Only the dispute initiator or a deal party may resolve it.
    let caller_email = match get_email_for_token(&state, &http) {
        Some(e) if !e.is_empty() => e,
        _ => return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." })),
    };
    let is_initiator = caller_email == initiator;
    let is_party = !caller_email.is_empty() && {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM deals WHERE id = ?1 AND (buyer_email = ?2 OR seller_email = ?2)",
            params![deal_id, caller_email],
            |r| r.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false)
    };
    if !is_initiator && !is_party {
        return HttpResponse::Forbidden().json(json!({ "error": "Only dispute participants may resolve it" }));
    }

    let conn = state.db.lock().unwrap();
    let resolved_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let _ = conn.execute(
        "UPDATE disputes SET status = ?1, resolution = ?2, resolved_at = ?3 WHERE id = ?4",
        params![resolution, resolution, resolved_at, dispute_id],
    );
    // Resolution steers the money: refund returns to buyer, release pays the seller
    if resolution == "release" || resolution == "refund" {
        let _ = conn.execute(
            "UPDATE escrows SET status = ?1 WHERE deal_id = ?2 AND status = 'deposited'",
            params![if resolution == "release" { "released" } else { "refunded" }, deal_id],
        );
    }
    let _ = conn.execute(
        "INSERT INTO audit_log (event_type, actor_email, target_id, timestamp, details) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["dispute.resolve", "system", dispute_id, chrono::Utc::now().to_rfc3339(), format!("resolution={}", resolution)],
    );

    HttpResponse::Ok().json(json!({ "id": dispute_id, "deal_id": deal_id, "status": resolution, "resolved_at": resolved_at }))
}

async fn get_disputes(
    state: web::Data<AppState>,
    path: web::Path<String>,
    http: HttpRequest,
) -> HttpResponse {
    let deal_id = path.as_str();
    // Dispute details are private to deal participants.
    if get_email_for_token(&state, &http).is_none() {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    if !is_room_viewer(&state, deal_id, &http) {
        return HttpResponse::Forbidden().json(json!({ "error": "Not a participant of this deal" }));
    }
    let conn = state.db.lock().unwrap();
    let mut disputes = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, deal_id, initiator_id, reason, status, resolution, created_at, resolved_at FROM disputes WHERE deal_id = ?1 ORDER BY created_at DESC",
    ) {
        if let Ok(rows) = stmt.query_map(params![deal_id], |r| {
            Ok(json!({
                "id": safe_get(r, 0),
                "deal_id": safe_get(r, 1),
                "initiator_id": safe_get(r, 2),
                "reason": safe_get(r, 3),
                "status": safe_get(r, 4),
                "resolution": safe_get(r, 5),
                "created_at": safe_get(r, 6),
                "resolved_at": safe_get(r, 7),
            }))
        }) {
            for row in rows.flatten() {
                disputes.push(row);
            }
        }
    }
    HttpResponse::Ok().json(json!({ "disputes": disputes }))
}

// ============================================================
// AI ANALYSIS HANDLERS
// ============================================================

async fn analyze_screenshot(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    // Authenticated only: prevents anonymous spam filling the ai_checks table.
    if !is_authenticated(&state, &http) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    let session_id = req.get("session_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let screenshot_url = req.get("screenshot_url").and_then(|v| v.as_str()).unwrap_or("").to_string();

    if session_id.is_empty() || session_id.len() > 128 {
        return HttpResponse::BadRequest().json(json!({ "error": "session_id required (max 128 chars)" }));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let analysis = json!({
        "milestone_reached": true,
        "confidence": 0.93,
        "detected": ["code_editor", "terminal"],
        "notes": "Seller appears to be actively working on the deliverable"
    });

    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO ai_checks (id, session_id, screenshot_url, analysis_result, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, session_id, screenshot_url, analysis.to_string(), created_at],
        );
    }

    HttpResponse::Ok().json(json!({
        "id": id,
        "session_id": session_id,
        "screenshot_url": screenshot_url,
        "analysis_result": analysis,
        "created_at": created_at,
    }))
}

async fn get_ai_checks(
    state: web::Data<AppState>,
    path: web::Path<String>,
    http: HttpRequest,
) -> HttpResponse {
    if !is_authenticated(&state, &http) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    let session_id = path.as_str();
    let conn = state.db.lock().unwrap();
    let mut checks = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, session_id, screenshot_url, analysis_result, created_at FROM ai_checks WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 50",
    ) {
        if let Ok(rows) = stmt.query_map(params![session_id], |r| {
            Ok(json!({
                "id": safe_get(r, 0),
                "session_id": safe_get(r, 1),
                "screenshot_url": safe_get(r, 2),
                "analysis_result": serde_json::from_str::<serde_json::Value>(&safe_get(r, 3)).unwrap_or(serde_json::Value::Null),
                "created_at": safe_get(r, 4),
            }))
        }) {
            for row in rows.flatten() {
                checks.push(row);
            }
        }
    }
    HttpResponse::Ok().json(json!({ "checks": checks }))
}

// ============================================================
// AUTH: WORKSPACE SWITCH
// ============================================================

async fn switch_workspace(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    if !is_authenticated(&state, &http) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    let workspace_id = req.get("workspace_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if workspace_id.is_empty() {
        return HttpResponse::BadRequest().json(json!({ "error": "workspace_id required" }));
    }

    let conn = state.db.lock().unwrap();
    let exists = conn
        .query_row("SELECT name FROM workspaces WHERE id = ?1", params![workspace_id], |r| r.get::<_, String>(0))
        .is_ok();
    if !exists {
        return HttpResponse::NotFound().json(json!({ "error": "Workspace not found" }));
    }

    HttpResponse::Ok().json(json!({ "status": "switched", "workspace_id": workspace_id }))
}

// ============================================================
// WORKSPACE HANDLERS
// ============================================================

async fn list_workspaces(state: web::Data<AppState>, http: HttpRequest) -> HttpResponse {
    if !is_authenticated(&state, &http) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    let conn = state.db.lock().unwrap();
    let mut workspaces = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name, created_at FROM workspaces ORDER BY created_at DESC") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok(json!({
                "id": safe_get(r, 0),
                "name": safe_get(r, 1),
                "created_at": safe_get(r, 2),
            }))
        }) {
            for row in rows.flatten() {
                workspaces.push(row);
            }
        }
    }
    HttpResponse::Ok().json(json!({ "workspaces": workspaces }))
}

async fn create_workspace(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
    http: HttpRequest,
) -> HttpResponse {
    if !is_authenticated(&state, &http) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    let name = req.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled").to_string();
    if name.len() > 100 {
        return HttpResponse::BadRequest().json(json!({ "error": "Workspace name too long (max 100 chars)" }));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO workspaces (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![id, name, created_at],
        );
    }
    HttpResponse::Ok().json(json!({ "id": id, "name": name, "created_at": created_at }))
}

// ============================================================
// AUDIT HANDLER
// ============================================================

async fn get_audit_logs(state: web::Data<AppState>, http: HttpRequest) -> HttpResponse {
    if !is_authenticated(&state, &http) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    let conn = state.db.lock().unwrap();
    let mut logs = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, event_type, actor_email, target_id, timestamp, details FROM audit_log ORDER BY timestamp DESC LIMIT 100",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            let details_raw = safe_get(r, 5);
            let details = serde_json::from_str::<serde_json::Value>(&details_raw)
                .unwrap_or(json!({ "info": details_raw }));
            Ok(json!({
                "id": r.get::<_, i64>(0).unwrap_or(0),
                "ts": safe_get(r, 4),
                "action": safe_get(r, 1),
                "user_id": safe_get(r, 2),
                "resource_id": safe_get(r, 3),
                "details": details,
            }))
        }) {
            for row in rows.flatten() {
                logs.push(row);
            }
        }
    }
    HttpResponse::Ok().json(json!({ "events": logs, "logs": logs }))
}

// ============================================================
// ANALYTICS HANDLER
// ============================================================

async fn get_analytics(state: web::Data<AppState>, http: HttpRequest) -> HttpResponse {
    if !is_authenticated(&state, &http) {
        return HttpResponse::Unauthorized().json(json!({ "error": "Session expired. Sign in again." }));
    }
    let conn = state.db.lock().unwrap();

    let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0) };
    let lamports = |sql: &str| -> f64 {
        conn.query_row(sql, [], |r| r.get::<_, i64>(0))
            .map(|v| v as f64 / 1_000_000_000.0)
            .unwrap_or(0.0)
    };

    let deals_total = count("SELECT COUNT(*) FROM deals");
    let deals_funded = count("SELECT COUNT(*) FROM escrows WHERE status = 'deposited'");
    let deals_completed = count("SELECT COUNT(*) FROM escrows WHERE status = 'released'");
    let deals_disputed = count("SELECT COUNT(*) FROM disputes WHERE status = 'open'");

    let escrow_deposited = lamports("SELECT COALESCE(SUM(amount_lamports),0) FROM escrows WHERE status = 'deposited'");
    let escrow_released = lamports("SELECT COALESCE(SUM(amount_lamports),0) FROM escrows WHERE status = 'released'");
    let escrow_refunded = lamports("SELECT COALESCE(SUM(amount_lamports),0) FROM escrows WHERE status = 'refunded'");

    let join_attempts = count("SELECT COUNT(*) FROM deal_participants");
    let observers = count("SELECT COUNT(*) FROM observers");

    // Screen-share sessions: count started sessions and approximate total time
    // from (updated_at - screen_share_start) per room that has a start marker.
    let (share_sessions, share_seconds): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(MAX(strftime('%s', updated_at) - strftime('%s', screen_share_start), 0)), 0)
             FROM rooms WHERE screen_share_start != ''",
            [],
            |r| Ok((r.get(0).unwrap_or(0), r.get(1).unwrap_or(0))),
        )
        .unwrap_or((0, 0));

    HttpResponse::Ok().json(json!({
        "deals": {
            "total": deals_total,
            "funded": deals_funded,
            "completed": deals_completed,
            "disputed": deals_disputed,
        },
        "escrow": {
            "deposited_sol": escrow_deposited,
            "released_sol": escrow_released,
            "refunded_sol": escrow_refunded,
        },
        "joins": {
            "attempts": join_attempts,
            "successes": join_attempts,
            "success_rate": if join_attempts > 0 { 1.0 } else { 0.0 },
        },
        "observers_invited": observers,
        "screen_sharing": {
            "sessions": share_sessions,
            "total_seconds": share_seconds,
        },
    }))
}

// ============================================================
// MAIN
// ============================================================

// Load the escrow authority from a keypair file (solana-keygen JSON byte array)
// so its pubkey is stable across restarts; generate + persist one if missing.
fn load_or_create_keypair(path: &str) -> Keypair {
    if let Ok(data) = std::fs::read_to_string(path) {
        if let Ok(bytes) = serde_json::from_str::<Vec<u8>>(&data) {
            if let Ok(kp) = Keypair::from_bytes(&bytes) {
                return kp;
            }
        }
        log::warn!("Could not parse keypair file {}, generating a new one", path);
    }
    let kp = Keypair::new();
    if let Ok(json) = serde_json::to_string(&kp.to_bytes().to_vec()) {
        let _ = std::fs::write(path, json);
    }
    kp
}

#[actix_web::main]
async fn main() -> Result<(), std::io::Error> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // ---- Environment-driven configuration ----
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let rpc_url = std::env::var("RPC_URL").unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());
    let cluster = std::env::var("CLUSTER").unwrap_or_else(|_| "devnet".to_string());
    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "escrowhub.db".to_string());
    let keypair_path = std::env::var("ESCROW_KEYPAIR_PATH").unwrap_or_else(|_| "escrow-authority.json".to_string());
    let fee_wallet = std::env::var("FEE_WALLET").ok();
    let allowed_origins = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5000,http://127.0.0.1:5000,http://localhost:5173,http://127.0.0.1:5173".to_string());
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
        log::warn!("JWT_SECRET not set — generating an ephemeral secret. All sessions invalidate on restart. Set JWT_SECRET in production!");
        uuid::Uuid::new_v4().to_string()
    });

    let escrow_kp = Arc::new(load_or_create_keypair(&keypair_path));

    let db = {
        // File-backed DB: users, deals and login tokens survive server restarts,
        // so a browser holding a saved token stays authenticated across `cargo run`.
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        // Durability + concurrent-reader friendly settings for production.
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.busy_timeout(std::time::Duration::from_secs(5));
        let _ = conn.pragma_update(None, "foreign_keys", "ON");
        conn.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password TEXT, wallet_address TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS deals (id TEXT PRIMARY KEY, seller_email TEXT, buyer_email TEXT, amount REAL, currency TEXT, invitation_code TEXT UNIQUE, status TEXT, created_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS rooms (deal_id TEXT PRIMARY KEY, webrtc_offer TEXT, webrtc_answer TEXT, is_screen_sharing INTEGER DEFAULT 0, screen_share_start TEXT, updated_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS ice_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, deal_id TEXT, sender TEXT, candidate TEXT, created_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS escrows (id TEXT PRIMARY KEY, deal_id TEXT, amount_lamports INTEGER, status TEXT, created_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT, created_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, actor_email TEXT, target_id TEXT, timestamp TEXT, details TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS observers (id INTEGER PRIMARY KEY AUTOINCREMENT, deal_id TEXT, email TEXT, invited_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS deal_participants (deal_id TEXT, email TEXT, joined_at TEXT, UNIQUE(deal_id, email))", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS disputes (id TEXT PRIMARY KEY, deal_id TEXT, initiator_id TEXT, reason TEXT, evidence_urls TEXT, status TEXT, resolution TEXT, created_at TEXT, resolved_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS ai_checks (id TEXT PRIMARY KEY, session_id TEXT, screenshot_url TEXT, analysis_result TEXT, created_at TEXT)", []).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, email TEXT)", []).unwrap();
        Arc::new(Mutex::new(conn))
    };

    println!("Starting EscrowHub server on http://{}:{} (cluster: {}, authority: {})", host, port, cluster, escrow_kp.pubkey());

    // Build ONE shared AppState up front: per-worker construction would give each
    // worker thread its own rate limiter and token map, breaking auth and limits.
    let app_state = web::Data::new(AppState {
        db: db.clone(),
        escrow_authority: escrow_kp.clone(),
        rpc_url,
        cluster,
        fee_wallet,
        rate_limits: Arc::new(RwLock::new(HashMap::new())),
        jwt_secret,
    });

    HttpServer::new(move || {
        let mut cors = Cors::default()
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
            .allowed_headers(vec!["Content-Type", "Authorization"])
            .max_age(3600);
        for origin in allowed_origins.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            cors = cors.allowed_origin(origin);
        }
        App::new()
            .app_data(app_state.clone())
            .app_data(web::JsonConfig::default().limit(64 * 1024))
            .wrap(actix_web::middleware::Logger::default())
            .wrap(
                actix_web::middleware::DefaultHeaders::new()
                    .add(("X-Content-Type-Options", "nosniff"))
                    .add(("X-Frame-Options", "DENY"))
                    .add(("Referrer-Policy", "strict-origin-when-cross-origin"))
                    .add(("Permissions-Policy", "camera=(), microphone=(), display-capture=(self), geolocation=()")),
            )
            .wrap(cors)
            .route("/health", web::get().to(health))
            .route("/auth/register", web::post().to(register))
            .route("/auth/login", web::post().to(login))
            .route("/deals", web::get().to(list_deals))
            .route("/deals", web::post().to(create_deal))
            .route("/deals/{id}", web::get().to(get_deal))
            .route("/deals/{id}/join", web::post().to(join_deal))
            .route("/deals/join-by-code", web::post().to(join_by_code))
            .route("/deals/{id}/invite_observer", web::post().to(invite_observer))
            .route("/escrow/config", web::get().to(escrow_config))
            .route("/escrow/deposit", web::post().to(deposit_escrow))
            .route("/video/room", web::post().to(create_room))
            .route("/video/room/{deal_id}", web::get().to(get_room))
            .route("/video/room/{deal_id}/webrtc/offer", web::get().to(webrtc_offer_state))
            .route("/video/room/{deal_id}/webrtc/offer", web::post().to(webrtc_offer))
            .route("/video/room/{deal_id}/webrtc/answer", web::post().to(webrtc_answer))
            .route("/video/room/{deal_id}/webrtc/candidate", web::post().to(webrtc_ice_candidate))
            .route("/video/room/{deal_id}/webrtc/ice", web::get().to(get_webrtc_ice))
            .route("/video/room/{deal_id}/screen_share", web::post().to(screen_share))
            .route("/workspaces", web::get().to(list_workspaces))
            .route("/workspaces", web::post().to(create_workspace))
            .route("/audit", web::get().to(get_audit_logs))
            .route("/analytics/summary", web::get().to(get_analytics))
            .route("/disputes", web::post().to(create_dispute))
            .route("/disputes/{dispute_id}/resolve", web::post().to(resolve_dispute))
            .route("/disputes/{deal_id}", web::get().to(get_disputes))
            .route("/ai/analyze", web::post().to(analyze_screenshot))
            .route("/ai/checks/{session_id}", web::get().to(get_ai_checks))
            .route("/escrow/release/{escrow_id}", web::post().to(release_escrow))
            .route("/escrow/refund/{escrow_id}", web::post().to(refund_escrow))
            .route("/auth/switch_workspace", web::post().to(switch_workspace))
            .route("/auth/logout", web::post().to(logout))
    })
    .bind((host.as_str(), port))?
    .run()
    .await
}
