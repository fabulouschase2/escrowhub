use actix_web::{post, web, HttpResponse, Responder};
use serde_json::json;
use crate::models::deal::{CreateDeal, DealResponse};

#[derive(Debug, Default)]
pub struct AppState {
    pub deals: tokio::sync::Mutex<Vec<crate::models::deal::Deal>>,
}

#[post("/deals")]
async fn create_deal(data: web::Data<AppState>, req: web::Json<CreateDeal>) -> impl Responder {
    let deals = data.deals.lock().await;
    let id = uuid::Uuid::new_v4();
    let deal = crate::models::deal::Deal {
        id,
        buyer_id: uuid::Uuid::new_v4(),
        seller_id: req.seller_id.clone(),
        platform_fee_pct: req.platform_fee_pct.unwrap_or(10.0),
        status: "created".to_string(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };
    let deals_mut = data.deals.lock().await;
    deals_mut.push(deal.clone());
    
    let resp = DealResponse {
        id: deal.id,
        seller_id: deal.seller_id,
        platform_fee_pct: deal.platform_fee_pct,
        status: deal.status,
        created_at: deal.created_at,
        updated_at: deal.updated_at,
    };
    HttpResponse::Ok().json(resp)
}

#[get("/deals/{id}")]
async fn get_deal(data: web::Data<AppState>, deal_id: web::Path<String>) -> impl Responder {
    let deals = data.deals.lock().await;
    let deal = deals.iter().find(|d| format!("{}", d.id).starts_with(&id));
    match deal {
        Some(d) => {
            let resp = DealResponse {
                id: d.id,
                seller_id: d.seller_id.clone(),
                platform_fee_pct: d.platform_fee_pct,
                status: d.status.clone(),
                created_at: d.created_at,
                updated_at: d.updated_at,
            };
            HttpResponse::Ok().json(resp)
        }
        None => HttpResponse::NotFound().json(json!({ "error": "Deal not found" })),
    }
}

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(create_deal);
    cfg.service(get_deal);
}