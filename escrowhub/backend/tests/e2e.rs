//! End-to-end integration tests: the full functional suite and the security
//! battery, driving a real server binary over HTTP. Run with `cargo test`.
//!
//! Each test spawns its own server on a unique port with a throwaway database,
//! so rate-limit buckets and data never leak between tests.

use std::process::{Child, Command};
use std::time::{Duration, Instant};

use reqwest::blocking::Client;
use serde_json::{json, Value};

struct Server {
    child: Child,
    port: u16,
}

impl Server {
    fn start(port: u16) -> Server {
        let db = format!("test-db-{port}.sqlite");
        let _ = std::fs::remove_file(&db);
        let child = Command::new(env!("CARGO_BIN_EXE_backend"))
            .env("PORT", port.to_string())
            .env("HOST", "127.0.0.1")
            .env("DATABASE_PATH", &db)
            .env("ESCROW_KEYPAIR_PATH", format!("test-key-{port}.json"))
            .env("RUST_LOG", "error")
            .spawn()
            .expect("failed to spawn server binary");
        let server = Server { child, port };
        server.wait_healthy();
        server
    }

    fn wait_healthy(&self) {
        let client = Client::new();
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            if let Ok(resp) = client.get(self.url("/health")).send() {
                if resp.status().as_u16() == 200 {
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        panic!("server on port {} did not become healthy", self.port);
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{}", self.port, path)
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn register(server: &Server, client: &Client, email: &str, password: &str) -> Value {
    let resp = client
        .post(server.url("/auth/register"))
        .json(&json!({ "email": email, "password": password }))
        .send()
        .expect("register request failed");
    assert_eq!(resp.status().as_u16(), 200, "register {email} failed");
    resp.json().expect("register response json")
}

fn token_of(user: &Value) -> String {
    user["token"].as_str().expect("token in register response").to_string()
}

/// Status code for a request with optional bearer token and optional JSON body.
fn req_status(
    server: &Server,
    client: &Client,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<&Value>,
) -> u16 {
    let mut req = match method {
        "POST" => client.post(server.url(path)),
        "GET" => client.get(server.url(path)),
        _ => panic!("unsupported method {method}"),
    };
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    if let Some(b) = body {
        req = req.json(b);
    }
    req.send().expect("request failed").status().as_u16()
}

fn req_json(
    server: &Server,
    client: &Client,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<&Value>,
) -> (u16, Value) {
    let mut req = match method {
        "POST" => client.post(server.url(path)),
        "GET" => client.get(server.url(path)),
        _ => panic!("unsupported method {method}"),
    };
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    if let Some(b) = body {
        req = req.json(b);
    }
    let mut resp = req.send().expect("request failed");
    let status = resp.status().as_u16();
    let text = resp.text().expect("response body");
    let parsed = serde_json::from_str(&text).unwrap_or(Value::Null);
    (status, parsed)
}

fn uniq(tag: &str, port: u16) -> String {
    let n = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{tag}{port}{n}")
}

// ============================================================
// Functional suite (was test_all_improvements.sh)
// ============================================================

#[test]
fn full_functional_flow() {
    let server = Server::start(8181);
    let client = Client::builder().timeout(Duration::from_secs(20)).build().unwrap();
    let run = uniq("u", 8181);

    // Health + escrow config
    let (status, health) = req_json(&server, &client, "GET", "/health", None, None);
    assert_eq!(status, 200, "health check");
    assert_eq!(health["status"], "ok", "health body");
    let (status, config) = req_json(&server, &client, "GET", "/escrow/config", None, None);
    assert_eq!(status, 200, "escrow config");
    assert!(config["escrow_authority"].as_str().is_some(), "authority present");

    // Register three roles
    let buyer = register(&server, &client, &format!("buy{run}@x.com"), "password123");
    let seller = register(&server, &client, &format!("sel{run}@x.com"), "password123");
    let stranger = register(&server, &client, &format!("str{run}@x.com"), "password123");
    let buyer_token = token_of(&buyer);
    let seller_token = token_of(&seller);
    let stranger_token = token_of(&stranger);

    // Login works and bad password is rejected
    let (status, _) = req_json(&server, &client, "POST", "/auth/login", None,
        Some(&json!({ "email": format!("buy{run}@x.com"), "password": "password123" })));
    assert_eq!(status, 200, "login with valid credentials");
    let (status, _) = req_json(&server, &client, "POST", "/auth/login", None,
        Some(&json!({ "email": format!("buy{run}@x.com"), "password": "wrongpass" })));
    assert_eq!(status, 401, "reject invalid password");

    // Create deal: creator is the buyer, invitation code issued
    let (status, deal) = req_json(&server, &client, "POST", "/deals", Some(&buyer_token),
        Some(&json!({ "seller_id": format!("sel{run}@x.com"), "amount": 0.5, "currency": "SOL" })));
    assert_eq!(status, 200, "create deal");
    let deal_id = deal["id"].as_str().expect("deal id").to_string();
    let inv_code = deal["invitation_code"].as_str().expect("invitation code").to_string();
    assert!(inv_code.starts_with("inv-"), "invitation code format");

    // Access control for a stranger (valid token, no participation)
    let (status, _) = req_json(&server, &client, "GET", &format!("/deals/{deal_id}"), Some(&stranger_token), None);
    assert_eq!(status, 403, "stranger blocked from deal");
    let (status, _) = req_json(&server, &client, "GET", &format!("/video/room/{deal_id}"), Some(&stranger_token), None);
    assert_eq!(status, 403, "stranger blocked from room");
    let (status, _) = req_json(&server, &client, "POST", &format!("/deals/{deal_id}/join"), Some(&stranger_token),
        Some(&json!({ "code": "inv-fake-code" })));
    assert_eq!(status, 403, "stranger blocked with invalid code");

    // Join by path AND join by code alone (no deal id in URL)
    let (status, _) = req_json(&server, &client, "POST", &format!("/deals/{deal_id}/join"), Some(&stranger_token),
        Some(&json!({ "code": inv_code })));
    assert_eq!(status, 200, "stranger joined with valid code");
    let (status, joined) = req_json(&server, &client, "POST", "/deals/join-by-code", Some(&seller_token),
        Some(&json!({ "code": inv_code })));
    assert_eq!(status, 200, "join-by-code resolves the deal from the code alone");
    assert_eq!(joined["deal_id"], Value::String(deal_id.clone()), "join-by-code deal id");

    // Viewer can now read the deal; deal exposes viewer_role
    let (status, deal_view) = req_json(&server, &client, "GET", &format!("/deals/{deal_id}"), Some(&stranger_token), None);
    assert_eq!(status, 200, "joined user reads deal");
    assert_eq!(deal_view["viewer_role"], "participant", "joined user role");
    let (status, deal_view_buyer) = req_json(&server, &client, "GET", &format!("/deals/{deal_id}"), Some(&buyer_token), None);
    assert_eq!(status, 200, "buyer reads deal");
    assert_eq!(deal_view_buyer["viewer_role"], "buyer", "buyer role");

    // Observer invitation (deal party only)
    let (status, _) = req_json(&server, &client, "POST", &format!("/deals/{deal_id}/invite_observer"), Some(&buyer_token),
        Some(&json!({ "observer_email": format!("obs{run}@x.com") })));
    assert_eq!(status, 200, "buyer invites observer");

    // Screen sharing: ONLY the seller may share; the buyer watches
    let (status, _) = req_json(&server, &client, "POST", &format!("/video/room/{deal_id}/screen_share"), Some(&buyer_token),
        Some(&json!({ "is_sharing": true })));
    assert_eq!(status, 403, "buyer must not be able to share screens");
    let (status, _) = req_json(&server, &client, "POST", &format!("/video/room/{deal_id}/screen_share"), Some(&seller_token),
        Some(&json!({ "is_sharing": true })));
    assert_eq!(status, 200, "seller starts screen share");
    let (status, room) = req_json(&server, &client, "GET", &format!("/video/room/{deal_id}"), Some(&buyer_token), None);
    assert_eq!(status, 200, "buyer reads room");
    assert_eq!(room["room_state"]["is_screen_sharing"], true, "buyer sees seller sharing");
    let (status, _) = req_json(&server, &client, "POST", &format!("/video/room/{deal_id}/screen_share"), Some(&seller_token),
        Some(&json!({ "is_sharing": false })));
    assert_eq!(status, 200, "seller stops screen share");

    // WebRTC signaling between participants
    let (status, _) = req_json(&server, &client, "POST", &format!("/video/room/{deal_id}/webrtc/offer"), Some(&buyer_token),
        Some(&json!({ "offer": "v=0 offer sdp" })));
    assert_eq!(status, 200, "offer stored");
    let (status, room) = req_json(&server, &client, "GET", &format!("/video/room/{deal_id}"), Some(&seller_token), None);
    assert!(room["room_state"]["webrtc_offer"].as_str().is_some(), "offer in room state");
    let (status, _) = req_json(&server, &client, "POST", &format!("/video/room/{deal_id}/webrtc/answer"), Some(&seller_token),
        Some(&json!({ "answer": "v=0 answer sdp" })));
    assert_eq!(status, 200, "answer stored");
    let (status, _) = req_json(&server, &client, "POST", &format!("/video/room/{deal_id}/webrtc/candidate"), Some(&buyer_token),
        Some(&json!({ "candidate": { "candidate": "candidate:1 udp 1 127.0.0.1 5000 typ host" }, "sender": "buyer" })));
    assert_eq!(status, 200, "ice candidate stored");
    let (status, ice) = req_json(&server, &client, "GET", &format!("/video/room/{deal_id}/webrtc/ice"), Some(&seller_token), None);
    assert_eq!(status, 200, "ice retrieval");
    assert!(ice["candidates"].as_array().map(|a| !a.is_empty()).unwrap_or(false), "candidate present");

    // Code-joined participants take part in signaling (the seller answers the
    // buyer's offer through it). A user who never joined must still be blocked.
    let outsider = register(&server, &client, &format!("out{run}@x.com"), "password123");
    let outsider_token = token_of(&outsider);
    let (status, _) = req_json(&server, &client, "GET", &format!("/video/room/{deal_id}/webrtc/offer"), Some(&outsider_token), None);
    assert_eq!(status, 403, "never-joined user blocked from signaling");
    let (status, _) = req_json(&server, &client, "GET", &format!("/video/room/{deal_id}/webrtc/offer"), Some(&stranger_token), None);
    assert_eq!(status, 200, "code-joined participant may read signaling state");

    // Escrow deposit rejects an unverifiable signature (fail-closed on-chain check)
    let fake_sig = "3qFeEgzudBqRyxAsAgvFQmY3eUr4vGZWqHu9BCUnKc6VZvDZjVbYzVgeBceVac4FbOu9zDfqPZvYVAvVFp3nRyVN";
    let (status, _) = req_json(&server, &client, "POST", "/escrow/deposit", Some(&buyer_token),
        Some(&json!({ "deal_id": deal_id, "solana_tx_signature": fake_sig })));
    assert_eq!(status, 400, "deposit rejects unconfirmed signature");

    // Workspaces, audit, analytics
    let (status, _) = req_json(&server, &client, "GET", "/workspaces", Some(&buyer_token), None);
    assert_eq!(status, 200, "list workspaces");
    let (status, _) = req_json(&server, &client, "POST", "/workspaces", Some(&buyer_token),
        Some(&json!({ "name": "Acme Workspace" })));
    assert_eq!(status, 200, "create workspace");
    let (status, _) = req_json(&server, &client, "GET", "/audit", Some(&buyer_token), None);
    assert_eq!(status, 200, "audit logs");
    let (status, _) = req_json(&server, &client, "GET", "/analytics/summary", Some(&buyer_token), None);
    assert_eq!(status, 200, "analytics summary");
}

// ============================================================
// Security battery (was test_security.sh)
// ============================================================

#[test]
fn security_battery() {
    let server = Server::start(8182);
    let client = Client::builder().timeout(Duration::from_secs(20)).build().unwrap();
    let run = uniq("s", 8182);

    let attacker = register(&server, &client, &format!("atk{run}@x.com"), "attacker123");
    let victim = register(&server, &client, &format!("vic{run}@x.com"), "victim1234");
    let atk_token = token_of(&attacker);
    let vic_token = token_of(&victim);

    let (_, deal) = req_json(&server, &client, "POST", "/deals", Some(&vic_token),
        Some(&json!({ "seller_id": format!("sel{run}@x.com"), "amount": 1.5, "currency": "SOL" })));
    let deal_id = deal["id"].as_str().unwrap().to_string();

    // --- Auth bypass: missing or invalid tokens are 401 (frontend redirects to login) ---
    for (desc, method, path) in [
        ("deals list", "GET", "/deals"),
        ("audit", "GET", "/audit"),
        ("analytics", "GET", "/analytics/summary"),
        ("workspaces", "GET", "/workspaces"),
        ("ai checks", "GET", "/ai/checks/x"),
    ] {
        let s = req_status(&server, &client, method, path, None, None);
        assert_eq!(s, 401, "{desc}: missing token must be 401");
    }
    for (desc, method, path, body) in [
        ("create workspace", "POST", "/workspaces", json!({ "name": "x" })),
        ("ai analyze", "POST", "/ai/analyze", json!({ "session_id": "s" })),
        ("switch workspace", "POST", "/auth/switch_workspace", json!({ "workspace_id": "x" })),
    ] {
        let s = req_status(&server, &client, method, path, None, Some(&body));
        assert_eq!(s, 401, "{desc}: missing token must be 401");
    }
    let s = req_status(&server, &client, "GET", "/deals/anything", Some("not-a-real-token"), None);
    assert_eq!(s, 401, "garbage token must be 401");

    // --- IDOR: valid token, no participation -> 403 ---
    let s = req_status(&server, &client, "GET", &format!("/deals/{deal_id}"), Some(&atk_token), None);
    assert_eq!(s, 403, "stranger blocked from victim deal");
    let s = req_status(&server, &client, "GET", &format!("/video/room/{deal_id}"), Some(&atk_token), None);
    assert_eq!(s, 403, "stranger blocked from victim room");
    let s = req_status(&server, &client, "POST", "/video/room", Some(&atk_token),
        Some(&json!({ "deal_id": deal_id })));
    assert_eq!(s, 403, "stranger blocked from creating victim room");
    let s = req_status(&server, &client, "POST", &format!("/video/room/{deal_id}/screen_share"), Some(&atk_token),
        Some(&json!({ "is_sharing": true })));
    assert_eq!(s, 403, "stranger blocked from victim screen share");
    let s = req_status(&server, &client, "POST", &format!("/video/room/{deal_id}/webrtc/offer"), Some(&atk_token),
        Some(&json!({ "offer": "v=0" })));
    assert_eq!(s, 403, "stranger blocked from signaling");
    let s = req_status(&server, &client, "GET", &format!("/disputes/{deal_id}"), Some(&atk_token), None);
    assert_eq!(s, 403, "stranger blocked from victim disputes");
    let s = req_status(&server, &client, "POST", &format!("/deals/{deal_id}/invite_observer"), Some(&atk_token),
        Some(&json!({ "observer_email": "o@x.com" })));
    assert_eq!(s, 403, "stranger cannot invite observers");

    // Stranger's deal list must not contain the victim's deal
    let (_, deals) = req_json(&server, &client, "GET", "/deals", Some(&atk_token), None);
    let leaked = deals["deals"].as_array().unwrap().iter()
        .any(|d| d["id"].as_str() == Some(deal_id.as_str()));
    assert!(!leaked, "stranger deal list leaks victim deal");

    // --- Money movement ---
    let s = req_status(&server, &client, "POST", "/escrow/release/fake-escrow", Some(&atk_token), None);
    assert_eq!(s, 403, "stranger cannot release escrow");
    let s = req_status(&server, &client, "POST", "/escrow/refund/fake-escrow", Some(&atk_token), None);
    assert_eq!(s, 403, "stranger cannot refund escrow");
    let fake_sig = "3qFeEgzudBqRyxAsAgvFQmY3eUr4vGZWqHu9BCUnKc6VZvDZjVbYzVgeBceVac4FbOu9zDfqPZvYVAvVFp3nRyVN";
    let s = req_status(&server, &client, "POST", "/escrow/deposit", Some(&atk_token),
        Some(&json!({ "deal_id": deal_id, "solana_tx_signature": fake_sig })));
    assert_eq!(s, 403, "stranger cannot deposit into victim deal");

    let (_, dispute) = req_json(&server, &client, "POST", "/disputes", Some(&vic_token),
        Some(&json!({ "deal_id": deal_id, "initiator_id": format!("vic{run}@x.com"), "reason": "test" })));
    let dispute_id = dispute["id"].as_str().unwrap().to_string();
    let s = req_status(&server, &client, "POST", &format!("/disputes/{dispute_id}/resolve"), Some(&atk_token),
        Some(&json!({ "resolution": "release" })));
    assert_eq!(s, 403, "stranger cannot resolve victim dispute");

    // --- Account takeover ---
    let s = req_status(&server, &client, "POST", "/auth/register", None,
        Some(&json!({ "email": format!("vic{run}@x.com"), "password": "hacked12345" })));
    assert_eq!(s, 409, "re-register existing email rejected");
    let s = req_status(&server, &client, "POST", "/auth/login", None,
        Some(&json!({ "email": format!("vic{run}@x.com"), "password": "victim1234" })));
    assert_eq!(s, 200, "victim original password still works");
    let s = req_status(&server, &client, "POST", "/auth/login", None,
        Some(&json!({ "email": format!("vic{run}@x.com"), "password": "hacked12345" })));
    assert_eq!(s, 401, "attacker-injected password rejected");

    // --- Password storage: bcrypt hash, never plaintext ---
    let db_file = format!("test-db-8182.sqlite");
    let db_bytes = std::fs::read(&db_file).expect("test db exists");
    let plaintext_found = db_bytes.windows(10).any(|w| w == b"victim1234");
    assert!(!plaintext_found, "plaintext password found in database file");

    // --- SQL injection (parameterized queries) ---
    let s = req_status(&server, &client, "POST", "/auth/login", None,
        Some(&json!({ "email": "' OR 1=1 --", "password": "x" })));
    assert_eq!(s, 401, "login SQLi rejected");
    let s = req_status(&server, &client, "GET", "/deals/%27%20OR%201%3D1--", Some(&atk_token), None);
    assert!(s == 403 || s == 404, "path SQLi rejected, got {s}");
    let s = req_status(&server, &client, "POST", "/deals/join-by-code", Some(&vic_token),
        Some(&json!({ "code": "inv' OR 1=1 --" })));
    assert!(s == 403 || s == 404 || s == 400, "join code SQLi rejected, got {s}");

    // --- Rate limiting: 6 rapid failures -> 429 ---
    let mut rate_limited = false;
    for i in 0..8 {
        let s = req_status(&server, &client, "POST", "/auth/login", None,
            Some(&json!({ "email": format!("rl{run}{i}@x.com"), "password": "wrong" })));
        if s == 429 {
            rate_limited = true;
            break;
        }
    }
    assert!(rate_limited, "login rate limit did not trigger");

    // --- Payload abuse: oversized JSON rejected ---
    let big = "A".repeat(100_000);
    let s = req_status(&server, &client, "POST", "/deals", Some(&vic_token),
        Some(&json!({ "seller_id": big, "amount": 1.0 })));
    assert!(s == 400 || s == 413, "oversized payload rejected, got {s}");

    // --- CORS preflight ---
    let resp = client
        .request(reqwest::Method::OPTIONS, server.url("/auth/login"))
        .header("Origin", "http://evil.example.com")
        .header("Access-Control-Request-Method", "POST")
        .send()
        .expect("preflight");
    assert_eq!(resp.status().as_u16(), 400, "evil origin preflight rejected");
    let resp = client
        .request(reqwest::Method::OPTIONS, server.url("/auth/login"))
        .header("Origin", "http://localhost:5000")
        .header("Access-Control-Request-Method", "POST")
        .send()
        .expect("preflight");
    assert_eq!(resp.status().as_u16(), 200, "allowed origin preflight accepted");

    // --- Input validation ---
    let s = req_status(&server, &client, "POST", "/auth/register", None,
        Some(&json!({ "email": "notanemail", "password": "password123" })));
    assert_eq!(s, 400, "bad email rejected");
    let s = req_status(&server, &client, "POST", "/auth/register", None,
        Some(&json!({ "email": format!("ok{run}@x.com"), "password": "short" })));
    assert_eq!(s, 400, "short password rejected");
    let s = req_status(&server, &client, "POST", "/escrow/deposit", Some(&vic_token),
        Some(&json!({ "deal_id": deal_id, "solana_tx_signature": "zzz-not-base58!!!" })));
    assert_eq!(s, 400, "non-base58 signature rejected");
    let s = req_status(&server, &client, "GET", "/video/room/00000000-0000-0000-0000-000000000000", Some(&vic_token), None);
    assert!(s == 403 || s == 404, "room for nonexistent deal blocked, got {s}");

    // Cleanup db files created by this test run
    let _ = std::fs::remove_file("test-db-8182.sqlite");
    let _ = std::fs::remove_file("test-key-8182.json");
}
