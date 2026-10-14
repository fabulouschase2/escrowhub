# Full MVP Project

This monorepo contains:

- **frontend** – React + Vite + Tailwind CSS UI
- **backend** – Rust + Actix‑web API server
- **contracts** – Solana Anchor program (non‑custodial escrow)
- **docker-compose.yml** – local development stack (PostgreSQL, LiveKit, Solana test validator)

## Quick start (local dev)
```bash
# Clone the repo (if this were a remote repo) and cd into the workspace
# Install frontend dependencies
cd frontend && npm install && npm run dev

# Build and run the Rust backend
cd ../backend && cargo run

# Build and deploy the Anchor program to the Solana devnet
cd ../contracts && anchor build && anchor deploy
```

## Production deployment
- Frontend → Vercel (`npm run build` then deploy the `dist` folder)
- Backend → Railway/Render (Dockerfile provided)
- Solana program → devnet → mainnet upgrade
