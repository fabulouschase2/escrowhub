# EscrowHub — Production Readiness

This document covers what is production-ready **in this codebase today**, how to
deploy it, and — just as important — what a real-world launch still requires
beyond code.

---

## 1. What is production-ready in this codebase

### Authentication & sessions
- **bcrypt-hashed passwords** (cost 12 default), plaintext never stored or logged.
- **Signed JWT sessions** (HS256) with a 7-day expiry; secrets come from `JWT_SECRET`.
- **Server-side revocation** — `POST /auth/logout` deletes the token row, so
  sessions can be killed centrally; every request validates signature + expiry
  + revocation.
- **Account-takeover guard** — registering an existing email returns 409 and
  never overwrites credentials.
- **Per-IP login rate limiting** (5 attempts / rolling 60s, self-resetting).

### Authorization
- Deal rooms, WebRTC signaling, screen sharing, escrow deposits, disputes and
  audit/analytics data are gated: **strangers get 403**, participants get access.
- **Money movement is role-restricted**: only the deal's *buyer* can release
  escrow, only the *seller* can refund; dispute resolution requires the
  initiator or a deal party.
- Deal listings are filtered server-side to the requesting user.

### Verification & integrity
- Deposits verify the **on-chain transaction status via Solana RPC** (5s timeout,
  fail-closed), require valid **base58 64-byte signatures**, one open escrow per
  deal, and use the deal's actual amount.
- **Audit log** records register/deposit/release/refund/dispute events.

### Platform hardening
- Security headers (`nosniff`, `DENY` framing, referrer policy, permissions policy).
- CORS restricted to configured origins only; 64KB JSON body cap.
- Structured request logging (`RUST_LOG`), WAL-mode SQLite with busy timeout.
- Config fully environment-driven (`HOST`, `PORT`, `RPC_URL`, `CLUSTER`,
  `JWT_SECRET`, `ALLOWED_ORIGINS`, `DATABASE_PATH`, `ESCROW_KEYPAIR_PATH`,
  `FEE_WALLET`).
- Stable escrow authority keypair loaded from (or persisted to) a keyfile.
- React **ErrorBoundary** so a page crash shows a recoverable screen; expired
  sessions auto-redirect to login instead of breaking the UI.

### Verified by automated suites
- `test_all_improvements.sh` — 28 functional checks (auth, deals, WebRTC
  signaling, escrow, disputes, workspaces, audit, analytics).
- `test_security.sh` — 37 security checks (auth bypass, IDOR, money-movement
  authorization, takeover, plaintext-DB scan, SQL injection, rate limiting,
  payload abuse, CORS, input validation).

---

## 2. Deployment

### Docker Compose (recommended)

```bash
# 1. Configure
cp backend/.env.example .env
# Edit .env — especially JWT_SECRET (openssl rand -hex 32)

# 2. Build & run
docker compose up -d --build

# 3. Verify
curl http://localhost:8080/health
open http://localhost:5000
```

Data (SQLite DB + escrow authority keypair) persists in the `backend-data`
volume. **Back that volume up** — the keypair controls deposited funds.

### Manual (dev-style)

```bash
# Backend
cd backend && cargo build --release
JWT_SECRET=$(openssl rand -hex 32) ./target/release/backend

# Frontend
cd frontend && npm ci && npm run build && npx serve dist -l 5000
```

### Production traffic
Run behind a TLS-terminating reverse proxy (nginx/Caddy/cloud LB) with a real
certificate. Set `ALLOWED_ORIGINS` to your public HTTPS origin(s), and point
`VITE_API_BASE` at the public API URL at frontend build time.

---

## 3. What a real-world launch still requires (honest gap list)

These are the things a full production team must do **before** handling real
user funds. They cannot be skipped and mostly cannot be done in code alone:

1. **A real, audited on-chain escrow program.** The current design transfers SOL
   to a keypair whose secret sits in a file the server can read. That is a
   custodial hot wallet — acceptable for a demo, unacceptable for production.
   Build a Solana program (Anchor) with PDAs so the chain enforces
   release/refund rules, then commission a professional security audit.
2. **Key management.** Whatever keys remain must live in a KMS/HSM (AWS KMS,
   Fireblocks, Vault) with rotation and multi-sig for treasury operations.
3. **Compliance & legal.** Escrow/money-transmission services are regulated:
   KYC/AML (e.g. via a vendor), sanctions screening, terms of service, privacy
   policy, and licensing analysis per jurisdiction. This decides whether you can
   legally operate at all.
4. **Dispute arbitration process.** Code can freeze funds; humans (or a
   governance flow) must decide them. Define the process, staffing, and SLAs,
   and restrict `resolve` to an authorized arbiter role.
5. **Database.** SQLite is single-writer. Move to PostgreSQL with migrations
   (sqlx/refinery), automated backups, and point-in-time recovery.
6. **Observability.** Centralized logs (Loki/Datadog), metrics + dashboards
   (Prometheus/Grafana), alerting, and tracing. Add `/healthz` vs `/readyz`
   semantics and uptime monitoring.
7. **Real-time transport.** HTTP polling for WebRTC signaling works but adds
   latency; move signaling to WebSockets, and add TURN servers so video
   connects behind symmetric NATs (currently STUN-only).
8. **AI milestones.** The AI analysis endpoint is a stub (fixed high
   confidence). Integrate a real model, gate it behind rate limits/queues, and
   treat its output as advisory — never as the sole basis for releasing funds.
9. **Penetration test & bug bounty** before launch, plus dependency scanning
   (cargo audit / npm audit) in CI.
10. **CI/CD.** Automated builds, the two test suites, staging environment,
    signed images, and rollback strategy.

---

## 4. Known limitations in the current build

- Single-node deployment (in-process rate limiter and SQLite file).
- No email verification / password reset (registration is email+password only).
- JWT secret is ephemeral unless `JWT_SECRET` is set — sessions invalidate on
  restart in dev.
- The platform fee (`platform_fee_pct`) is stored but not yet enforced on-chain.
- `escrow_authority.json` in the repo root is a dev artifact; never reuse a
  funded key from a file that has been in version control.
