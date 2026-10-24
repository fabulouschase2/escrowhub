# Deploying the EscrowHub Escrow Program (Real Live Contract)

This is a real Solana Anchor program. It is non-custodial: the buyer's tokens
are locked in an on-chain vault (a token account owned by a program PDA) and
can only move via the program's instructions.

## What was fixed / hardened for live use

1. **Multiple deals per buyer** — the deal PDA is now derived from
   `[b"deal", buyer, deal_seed]` where `deal_seed` is a fresh 32-byte value
   (e.g. a UUID) supplied per deal. Previously a buyer could only ever create
   one deal in their lifetime.
2. **Platform fee cannot be stolen** — `DealState.platform_authority` is
   stored at deal creation, and `release_escrow` / `arbiter_resolve` verify the
   fee vault authority equals it. Previously anyone could pass their own
   wallet as the fee vault and redirect the platform fee.
3. **On-chain dispute resolution** — new `arbiter_resolve` instruction lets
   the platform authority resolve a disputed deal (payout to seller with fee,
   or full refund to buyer) in a single atomic transaction.
4. **Atomic payouts** — fee + seller payout happen in one CPI sequence;
   arithmetic uses checked operations with a shared `split_amount` helper.

## Prerequisites

```bash
# Rust (stable) and the Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
solana --version

# Anchor via AVM
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.29.0
avm use 0.29.0
```

## Build & deploy (devnet first, then mainnet)

```bash
cd contracts

# Devnet wallet + SOL for rent/fees
solana-keygen new -o ~/.config/solana/id.json --force   # if you don't have one
solana config set --url devnet
solana airdrop 2          # repeat as needed (devnet only)

anchor build
# The program ID is printed at the end; update declare_id! if you deploy a new keypair:
#   solana-keygen new -o contracts/programs/escrow/escrow-keypair.json
#   solana address -k contracts/programs/escrow/escrow-keypair.json   -> put in declare_id!
anchor deploy --provider.cluster devnet

# Verify
solana program show Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
```

For mainnet-beta: `solana config set --url mainnet-beta`, fund the deploy
keypair with real SOL (~3-5 SOL for program rent), then `anchor deploy`.

## Client usage from the frontend

The frontend uses `@coral-xyz/anchor` + Phantom once the program is deployed.
Set these env vars for the frontend (e.g. `.env.local`):

```
VITE_ESCROW_PROGRAM_ID=Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
VITE_SOLANA_CLUSTER=devnet
```

When `VITE_ESCROW_PROGRAM_ID` is set, the Live Room's escrow buttons execute
the real on-chain instructions (`initialize_deal` → `deposit_escrow` →
`release_escrow` / `refund_escrow` / `open_dispute`) with Phantom signing.

## Custodial fallback (default without program deployment)

While the program is not deployed, the backend operates a **native SOL
custodial escrow** that is still real on-chain money movement:

- The backend holds one escrow authority keypair
  (`backend/escrow-authority.json`, or `ESCROW_AUTHORITY_KEYPAIR` env).
- Deposit: buyer's Phantom signs a real SOL transfer to the escrow authority.
  The backend verifies the transaction on-chain (signature status + the
  transfer instruction's destination and lamport amount) before marking the
  deal funded.
- Release / refund: the backend builds, signs and broadcasts a real
  transaction paying out the seller (minus platform fee) or the buyer.

This is a real, verifiable escrow (every movement is a Solscan-visible
transaction) but custody is with the platform keypair — for the fully
non-custodial flow, deploy the Anchor program above.
