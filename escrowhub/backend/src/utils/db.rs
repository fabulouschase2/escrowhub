use sqlx::{Pool, Sqlite};
use std::env;

pub async fn establish_connection() -> Pool<Sqlite> {
    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");
    Pool::<Sqlite>::connect(&database_url)
        .await
        .expect("Failed to create pool")
}