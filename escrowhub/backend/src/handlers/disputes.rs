use actix_web::{post, get, web, HttpResponse, Responder};
use serde_json::json;
use uuid::Uuid;
use sqlx::{Pool, Sqlite, Row};

#[derive(Debug, serde::Deserialize)]
pub struct CreateDispute {
    pub deal_id: Uuid,
    pub initiator_id: Uuid,
    pub reason: String,
    pub evidence_urls: Option<Vec<String>>,
}

#[derive(Debug, serde::Serialize)]
pub struct DisputeResponse {
    pub id: Uuid,
    pub deal_id: Uuid,
    pub initiator_id: Uuid,
    pub reason: String,
    pub evidence_urls: serde_json::Value,
    pub created_at: String,
    pub resolved_at: Option<String>,
    pub resolution: Option<String>,
}

#[post("/disputes")]
async fn create_dispute(pool: web::Data<Pool<Sqlite>>, req: web::Json<CreateDispute>) -> impl Responder {
    let evidence_json = serde_json::to_string(&req.evidence_urls.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

    let result = sqlx::query(
        r#"
        INSERT INTO disputes (deal_id, initiator_id, reason, evidence_urls, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        RETURNING id, deal_id, initiator_id, reason, evidence_urls, created_at, resolved_at, resolution
        "#,
    )
    .bind(req.deal_id.to_string())
    .bind(req.initiator_id.to_string())
    .bind(&req.reason)
    .bind(&evidence_json)
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to create dispute" }))
    });

    match result {
        Ok(dispute) => {
            let id: Uuid = dispute.get("id");
            let deal_id: Uuid = dispute.get("deal_id");
            let initiator_id: Uuid = dispute.get("initiator_id");
            let reason: String = dispute.get("reason");
            let evidence_urls: String = dispute.get("evidence_urls");
            let created_at: String = dispute.get("created_at");
            let resolved_at: Option<String> = dispute.get("resolved_at");
            let resolution: Option<String> = dispute.get("resolution");

            HttpResponse::Ok().json(DisputeResponse {
                id,
                deal_id,
                initiator_id,
                reason,
                evidence_urls: serde_json::from_str(&evidence_urls).unwrap_or(json!([])),
                created_at,
                resolved_at,
                resolution,
            })
        }
        Err(e) => {
            eprintln!("Error: {:?}", e);
            HttpResponse::InternalServerError().json(json!({ "error": "Failed to create dispute" }))
        }
    }
}

#[post("/disputes/{dispute_id}/resolve")]
async fn resolve_dispute(
    pool: web::Data<Pool<Sqlite>>,
    dispute_id: web::Path<String>,
    req: web::Json<serde_json::Value>,
) -> impl Responder {
    let resolution = req.get("resolution").and_then(|v| v.as_str()).unwrap_or("pending");

    let result = sqlx::query(
        r#"
        UPDATE disputes
        SET resolution = ?, resolved_at = datetime('now')
        WHERE id = ?
        RETURNING id, deal_id, initiator_id, reason, evidence_urls, created_at, resolved_at, resolution
        "#,
    )
    .bind(resolution)
    .bind(&*dispute_id)
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to resolve dispute" }))
    });

    match result {
        Ok(dispute) => {
            let id: Uuid = dispute.get("id");
            let deal_id: Uuid = dispute.get("deal_id");
            let initiator_id: Uuid = dispute.get("initiator_id");
            let reason: String = dispute.get("reason");
            let evidence_urls: String = dispute.get("evidence_urls");
            let created_at: String = dispute.get("created_at");
            let resolved_at: Option<String> = dispute.get("resolved_at");
            let resolution: Option<String> = dispute.get("resolution");

            HttpResponse::Ok().json(DisputeResponse {
                id,
                deal_id,
                initiator_id,
                reason,
                evidence_urls: serde_json::from_str(&evidence_urls).unwrap_or(json!([])),
                created_at,
                resolved_at,
                resolution,
            })
        }
        Err(e) => {
            eprintln!("Error: {:?}", e);
            HttpResponse::InternalServerError().json(json!({ "error": "Failed to resolve dispute" }))
        }
    }
}

#[get("/disputes/{deal_id}")]
async fn get_disputes(pool: web::Data<Pool<Sqlite>>, deal_id: web::Path<String>) -> impl Responder {
    let result = sqlx::query(
        r#"
        SELECT id, deal_id, initiator_id, reason, evidence_urls, created_at, resolved_at, resolution
        FROM disputes
        WHERE deal_id = ?
        ORDER BY created_at DESC
        "#,
    )
    .bind(&*deal_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to fetch disputes" }))
    });

    match result {
        Ok(disputes) => {
            let responses: Vec<DisputeResponse> = disputes.into_iter().map(|dispute| {
                let id: Uuid = dispute.get("id");
                let deal_id: Uuid = dispute.get("deal_id");
                let initiator_id: Uuid = dispute.get("initiator_id");
                let reason: String = dispute.get("reason");
                let evidence_urls: String = dispute.get("evidence_urls");
                let created_at: String = dispute.get("created_at");
                let resolved_at: Option<String> = dispute.get("resolved_at");
                let resolution: Option<String> = dispute.get("resolution");

                DisputeResponse {
                    id,
                    deal_id,
                    initiator_id,
                    reason,
                    evidence_urls: serde_json::from_str(&evidence_urls).unwrap_or(json!([])),
                    created_at,
                    resolved_at,
                    resolution,
                }
            }).collect();
            HttpResponse::Ok().json(responses)
        }
        Err(e) => {
            eprintln!("Error: {:?}", e);
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create_dispute);
    cfg.service(resolve_dispute);
    cfg.service(get_disputes);
}