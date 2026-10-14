use actix_web::{post, get, web, HttpResponse, Responder};
use serde_json::json;
use uuid::Uuid;
use sqlx::{Pool, Sqlite, Row};

#[derive(Debug, serde::Deserialize)]
pub struct DepositEscrow {
    pub deal_id: Uuid,
    pub amount: f64,
    pub token_mint: String,
    pub solana_tx_signature: String,
}

#[derive(Debug, serde::Serialize)]
pub struct EscrowResponse {
    pub id: Uuid,
    pub deal_id: Uuid,
    pub amount: f64,
    pub token_mint: String,
    pub escrow_state: String,
    pub solana_tx_signature: String,
    pub created_at: String,
}

#[post("/escrow/deposit")]
async fn deposit_escrow(pool: web::Data<Pool<Sqlite>>, req: web::Json<DepositEscrow>) -> impl Responder {
    let result = sqlx::query(
        r#"
        INSERT INTO escrows (deal_id, amount, token_mint, escrow_state, solana_tx_signature, created_at, updated_at)
        VALUES (?, ?, ?, 'deposited', ?, datetime('now'), datetime('now'))
        RETURNING id, deal_id, amount, token_mint, escrow_state, solana_tx_signature, created_at
        "#,
    )
    .bind(req.deal_id.to_string())
    .bind(req.amount)
    .bind(&req.token_mint)
    .bind(&req.solana_tx_signature)
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to create escrow" }))
    });

    match result {
        Ok(escrow) => {
            let id: Uuid = escrow.get("id");
            let deal_id: Uuid = escrow.get("deal_id");
            let amount: f64 = escrow.get("amount");
            let token_mint: String = escrow.get("token_mint");
            let escrow_state: String = escrow.get("escrow_state");
            let solana_tx_signature: String = escrow.get("solana_tx_signature");
            let created_at: String = escrow.get("created_at");

            HttpResponse::Ok().json(EscrowResponse {
                id,
                deal_id,
                amount,
                token_mint,
                escrow_state,
                solana_tx_signature,
                created_at,
            })
        }
        Err(e) => {
            eprintln!("Error: {:?}", e);
            HttpResponse::InternalServerError().json(json!({ "error": "Failed to create escrow" }))
        }
    }
}

#[post("/escrow/release/{escrow_id}")]
async fn release_escrow(pool: web::Data<Pool<Sqlite>>, escrow_id: web::Path<String>) -> impl Responder {
    let result = sqlx::query(
        r#"
        UPDATE escrows
        SET escrow_state = 'released', updated_at = datetime('now')
        WHERE id = ?
        RETURNING id, deal_id, amount, token_mint, escrow_state, solana_tx_signature, created_at
        "#,
    )
    .bind(&*escrow_id)
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to release escrow" }))
    });

    match result {
        Ok(escrow) => {
            let id: Uuid = escrow.get("id");
            let deal_id: Uuid = escrow.get("deal_id");
            let amount: f64 = escrow.get("amount");
            let token_mint: String = escrow.get("token_mint");
            let escrow_state: String = escrow.get("escrow_state");
            let solana_tx_signature: String = escrow.get("solana_tx_signature");
            let created_at: String = escrow.get("created_at");

            HttpResponse::Ok().json(EscrowResponse {
                id,
                deal_id,
                amount,
                token_mint,
                escrow_state,
                solana_tx_signature,
                created_at,
            })
        }
        Err(e) => {
            eprintln!("Error: {:?}", e);
            HttpResponse::InternalServerError().json(json!({ "error": "Failed to release escrow" }))
        }
    }
}

#[post("/escrow/refund/{escrow_id}")]
async fn refund_escrow(pool: web::Data<Pool<Sqlite>>, escrow_id: web::Path<String>) -> impl Responder {
    let result = sqlx::query(
        r#"
        UPDATE escrows
        SET escrow_state = 'refunded', updated_at = datetime('now')
        WHERE id = ?
        RETURNING id, deal_id, amount, token_mint, escrow_state, solana_tx_signature, created_at
        "#,
    )
    .bind(&*escrow_id)
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to refund escrow" }))
    });

    match result {
        Ok(escrow) => {
            let id: Uuid = escrow.get("id");
            let deal_id: Uuid = escrow.get("deal_id");
            let amount: f64 = escrow.get("amount");
            let token_mint: String = escrow.get("token_mint");
            let escrow_state: String = escrow.get("escrow_state");
            let solana_tx_signature: String = escrow.get("solana_tx_signature");
            let created_at: String = escrow.get("created_at");

            HttpResponse::Ok().json(EscrowResponse {
                id,
                deal_id,
                amount,
                token_mint,
                escrow_state,
                solana_tx_signature,
                created_at,
            })
        }
        Err(e) => {
            eprintln!("Error: {:?}", e);
            HttpResponse::InternalServerError().json(json!({ "error": "Failed to refund escrow" }))
        }
    }
}

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(deposit_escrow);
    cfg.service(release_escrow);
    cfg.service(refund_escrow);
}