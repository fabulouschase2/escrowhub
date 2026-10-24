# ---- Build stage ----
FROM rust:1.81-slim AS builder
WORKDIR /build
# Cache dependencies: copy manifests first
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN cargo build --release

# ---- Runtime stage ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /build/target/release/backend /app/backend
# Data directory for the SQLite database (mount a volume here)
RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/escrowhub.db \
    ESCROW_KEYPAIR_PATH=/app/data/escrow-authority.json \
    HOST=0.0.0.0 \
    PORT=8080
EXPOSE 8080
USER 1000
CMD ["/app/backend"]
