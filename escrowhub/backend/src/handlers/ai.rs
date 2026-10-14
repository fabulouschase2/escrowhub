use actix_web::{post, get, web, HttpResponse, Responder};
use serde_json::json;
use uuid::Uuid;
use sqlx::{Pool, Sqlite, Row};

#[derive(Debug, serde::Deserialize)]
pub struct AnalyzeScreenshot {
    pub session_id: Uuid,
    pub screenshot_url: String,
}

#[derive(Debug, serde::Serialize)]
pub struct AiAnalysisResponse {
    pub id: Uuid,
    pub session_id: Uuid,
    pub screenshot_url: String,
    pub analysis_result: serde_json::Value,
    pub created_at: String,
}

#[post("/ai/analyze")]
async fn analyze_screenshot(pool: web::Data<Pool<Sqlite>>, req: web::Json<AnalyzeScreenshot>) -> impl Responder {
    let mock_analysis = serde_json::json!({
        "milestone_reached": true,
        "confidence": 0.95,
        "details": "Account creation page detected with success indicator"
    });

    let result = sqlx::query(
        r#"
        INSERT INTO ai_checks (session_id, screenshot_url, analysis_result, created_at)
        VALUES (?, ?, ?, datetime('now'))
        RETURNING id, session_id, screenshot_url, analysis_result, created_at
        "#,
    )
    .bind(req.session_id.to_string())
    .bind(&req.screenshot_url)
    .bind(mock_analysis.to_string())
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to store AI analysis" }))
    });

    match result {
        Ok(check) => {
            let id: Uuid = check.get("id");
            let session_id: Uuid = check.get("session_id");
            let screenshot_url: String = check.get("screenshot_url");
            let analysis_result: String = check.get("analysis_result");
            let created_at: String = check.get("created_at");

            HttpResponse::Ok().json(AiAnalysisResponse {
                id,
                session_id,
                screenshot_url,
                analysis_result: serde_json::from_str(&analysis_result).unwrap_or(json!({})),
                created_at,
            })
        }
        Err(e) => {
            eprintln!("Error: {:?}", e);
            HttpResponse::InternalServerError().json(json!({ "error": "Failed to store AI analysis" }))
        }
    }
}

#[get("/ai/checks/{session_id}")]
async fn get_ai_checks(pool: web::Data<Pool<Sqlite>>, session_id: web::Path<String>) -> impl Responder {
    let result = sqlx::query(
        r#"
        SELECT id, session_id, screenshot_url, analysis_result, created_at
        FROM ai_checks
        WHERE session_id = ?
        ORDER BY created_at DESC
        "#,
    )
    .bind(&*session_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|e| {
        eprintln!("DB error: {:?}", e);
        HttpResponse::InternalServerError().json(json!({ "error": "Failed to fetch AI checks" }))
    });

    match result {
        Ok(checks) => {
            let responses: Vec<AiAnalysisResponse> = checks.into_iter().map(|check| {
                let id: Uuid = check.get("id");
                let session_id: Uuid = check.get("session_id");
                let screenshot_url: String = check.get("screenshot_url");
                let analysis_result: String = check.get("analysis_result");
                let created_at: String = check.get("created_at");

                AiAnalysisResponse {
                    id,
                    session_id,
                    screenshot_url,
                    analysis_result: serde_json::from_str(&analysis_result).unwrap_or(json!({})),
                    created_at,
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
    cfg.service(analyze_screenshot);
    cfg.service(get_ai_checks);
}