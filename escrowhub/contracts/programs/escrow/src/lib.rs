use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Maximum platform fee: 50% (5000 basis points)
const MAX_PLATFORM_FEE_BPS: u16 = 5000;

#[program]
pub mod escrow {
    use super::*;

    /// Create a deal: buyer opens an escrow deal naming the seller, the
    /// platform fee authority and the platform fee. A fresh 32-byte
    /// `deal_seed` (e.g. a UUID) lets the same buyer open unlimited deals —
    /// each gets its own PDA.
    pub fn initialize_deal(
        ctx: Context<InitializeDeal>,
        deal_seed: [u8; 32],
        platform_fee_bps: u16,
    ) -> Result<()> {
        require!(
            platform_fee_bps <= MAX_PLATFORM_FEE_BPS,
            EscrowError::FeeTooHigh
        );

        let deal = &mut ctx.accounts.deal;
        deal.buyer = ctx.accounts.buyer.key();
        deal.seller = ctx.accounts.seller.key();
        deal.platform_authority = ctx.accounts.platform_authority.key();
        deal.platform_fee_bps = platform_fee_bps;
        deal.status = DealStatus::Created;
        deal.bump = ctx.bumps.deal;
        Ok(())
    }

    /// Buyer deposits tokens into the escrow vault (a token account owned by
    /// the escrow_state PDA). Only the deal buyer may deposit.
    pub fn deposit_escrow(
        ctx: Context<DepositEscrow>,
        deal_seed: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        let deal = &ctx.accounts.deal;
        require!(
            deal.status == DealStatus::Created,
            EscrowError::InvalidDealStatus
        );
        require_keys!(deal.buyer == ctx.accounts.buyer.key(), EscrowError::Unauthorized);

        // Transfer tokens from buyer's ATA into the escrow vault.
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;

        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.deal = deal.key();
        escrow_state.amount = amount;
        escrow_state.status = EscrowStatus::Deposited;
        escrow_state.bump = ctx.bumps.escrow_state;

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Funded;
        Ok(())
    }

    /// Buyer releases the funds: platform fee goes to the vault owned by the
    /// deal's stored platform authority, the remainder goes to the seller.
    pub fn release_escrow(ctx: Context<ReleaseEscrow>, deal_seed: [u8; 32]) -> Result<()> {
        let deal = &ctx.accounts.deal;
        require_keys!(deal.buyer == ctx.accounts.buyer.key(), EscrowError::Unauthorized);
        require!(
            deal.status == DealStatus::Funded,
            EscrowError::InvalidDealStatus
        );
        // The fee vault MUST be owned by the platform authority recorded at
        // deal creation — otherwise anyone could steal the platform fee by
        // passing their own account.
        require_keys!(
            deal.platform_authority == ctx.accounts.fee_vault_authority.key(),
            EscrowError::Unauthorized
        );

        let escrow_state = &ctx.accounts.escrow_state;
        require!(
            escrow_state.status == EscrowStatus::Deposited,
            EscrowError::InvalidEscrowStatus
        );

        let amount = escrow_state.amount;
        let (fee, seller_amount) = split_amount(amount, deal.platform_fee_bps)?;

        let deal_key = deal.key();
        let bump = ctx.bumps.escrow_state;
        let seeds = &[b"escrow_state".as_ref(), deal_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        if fee > 0 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(cpi_ctx, fee)?;
        }

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.seller_token_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, seller_amount)?;

        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.status = EscrowStatus::Released;

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Completed;
        Ok(())
    }

    /// Refund the full deposited amount back to the buyer.
    /// Allowed for the buyer at any time while deposited, and for the seller
    /// once the deal is disputed.
    pub fn refund_escrow(ctx: Context<RefundEscrow>, deal_seed: [u8; 32]) -> Result<()> {
        let deal = &ctx.accounts.deal;
        // The deal PDA is derived from the buyer's key, so the buyer account
        // passed in must match what is stored on-chain.
        require_keys!(deal.buyer == ctx.accounts.buyer.key(), EscrowError::Unauthorized);

        let is_buyer = ctx.accounts.refunder.key() == deal.buyer;
        let is_seller = ctx.accounts.refunder.key() == deal.seller;
        require!(is_buyer || is_seller, EscrowError::Unauthorized);

        if !is_buyer {
            // Only the buyer can refund while not disputed; the seller may
            // refund once the deal is in dispute.
            require!(
                deal.status == DealStatus::Disputed,
                EscrowError::Unauthorized
            );
        }
        require!(
            deal.status == DealStatus::Funded || deal.status == DealStatus::Disputed,
            EscrowError::InvalidDealStatus
        );

        let escrow_state = &ctx.accounts.escrow_state;
        require!(
            escrow_state.status == EscrowStatus::Deposited,
            EscrowError::InvalidEscrowStatus
        );

        let amount = escrow_state.amount;
        let deal_key = deal.key();
        let bump = ctx.bumps.escrow_state;
        let seeds = &[b"escrow_state".as_ref(), deal_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.status = EscrowStatus::Refunded;

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Refunded;
        Ok(())
    }

    /// Either party opens a dispute; this freezes release and enables seller
    /// refunds. Observer dispute requests go through the platform backend and
    /// are executed on-chain by the platform authority via arbiter_resolve.
    pub fn open_dispute(ctx: Context<OpenDispute>, deal_seed: [u8; 32]) -> Result<()> {
        let deal = &ctx.accounts.deal;
        let is_buyer = ctx.accounts.party.key() == deal.buyer;
        let is_seller = ctx.accounts.party.key() == deal.seller;
        require!(is_buyer || is_seller, EscrowError::Unauthorized);
        require!(
            deal.status == DealStatus::Funded,
            EscrowError::InvalidDealStatus
        );

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Disputed;
        Ok(())
    }

    /// Platform authority resolves a disputed deal on-chain:
    /// `release_to_seller` = true pays fee + seller, false refunds the buyer.
    pub fn arbiter_resolve(ctx: Context<ArbiterResolve>, deal_seed: [u8; 32], release_to_seller: bool) -> Result<()> {
        let deal = &ctx.accounts.deal;
        require_keys!(
            deal.platform_authority == ctx.accounts.arbiter.key(),
            EscrowError::Unauthorized
        );
        require!(
            deal.status == DealStatus::Disputed,
            EscrowError::InvalidDealStatus
        );

        let escrow_state = &ctx.accounts.escrow_state;
        require!(
            escrow_state.status == EscrowStatus::Deposited,
            EscrowError::InvalidEscrowStatus
        );

        let amount = escrow_state.amount;
        let deal_key = deal.key();
        let bump = ctx.bumps.escrow_state;
        let seeds = &[b"escrow_state".as_ref(), deal_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        if release_to_seller {
            let (fee, seller_amount) = split_amount(amount, deal.platform_fee_bps)?;
            if fee > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                    signer_seeds,
                );
                token::transfer(cpi_ctx, fee)?;
            }
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(cpi_ctx, seller_amount)?;

            let escrow_state = &mut ctx.accounts.escrow_state;
            escrow_state.status = EscrowStatus::Released;
            let deal = &mut ctx.accounts.deal;
            deal.status = DealStatus::Completed;
        } else {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(cpi_ctx, amount)?;

            let escrow_state = &mut ctx.accounts.escrow_state;
            escrow_state.status = EscrowStatus::Refunded;
            let deal = &mut ctx.accounts.deal;
            deal.status = DealStatus::Refunded;
        }
        Ok(())
    }
}

/// Split an amount into (platform fee, seller payout) given fee basis points.
fn split_amount(amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(EscrowError::ArithmeticOverflow)? as u64;
    let seller_amount = amount
        .checked_sub(fee)
        .ok_or(EscrowError::ArithmeticOverflow)?;
    Ok((fee, seller_amount))
}

// ============ ACCOUNT CONTEXTS ============

#[derive(Accounts)]
#[instruction(deal_seed: [u8; 32])]
pub struct InitializeDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: seller is only stored as a pubkey; no account constraints needed.
    pub seller: UncheckedAccount<'info>,
    /// CHECK: the platform fee receiver. Its pubkey is stored on the deal so
    /// release can never redirect fees to an attacker-chosen vault.
    pub platform_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = buyer,
        space = 8 + DealState::INIT_SPACE,
        seeds = [b"deal", buyer.key().as_ref(), &deal_seed],
        bump
    )]
    pub deal: Account<'info, DealState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(deal_seed: [u8; 32])]
pub struct DepositEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"deal", buyer.key().as_ref(), &deal_seed],
        bump = deal.bump
    )]
    pub deal: Account<'info, DealState>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,
    /// Escrow vault: an ATA owned by the escrow_state PDA.
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = escrow_state
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = buyer,
        space = 8 + EscrowStateAccount::INIT_SPACE,
        seeds = [b"escrow_state", deal.key().as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowStateAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(deal_seed: [u8; 32])]
pub struct ReleaseEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"deal", buyer.key().as_ref(), &deal_seed],
        bump = deal.bump
    )]
    pub deal: Account<'info, DealState>,
    #[account(
        mut,
        seeds = [b"escrow_state", deal.key().as_ref()],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowStateAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow_state
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    /// Fee vault owned by the platform authority. The authority account is
    /// validated against `deal.platform_authority` in the handler, so the
    /// platform fee cannot be redirected.
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = fee_vault_authority
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    /// CHECK: must equal the deal's stored platform authority (checked in handler).
    pub fee_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = deal.seller
    )]
    pub seller_token_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(deal_seed: [u8; 32])]
pub struct RefundEscrow<'info> {
    /// The buyer or the seller triggers the refund.
    #[account(mut)]
    pub refunder: Signer<'info>,
    /// CHECK: the deal's buyer — the deal PDA is derived from this key, so a
    /// wrong account simply fails PDA derivation (also asserted in handler).
    pub buyer: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"deal", buyer.key().as_ref(), &deal_seed],
        bump = deal.bump
    )]
    pub deal: Account<'info, DealState>,
    #[account(
        mut,
        seeds = [b"escrow_state", deal.key().as_ref()],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowStateAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow_state
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(deal_seed: [u8; 32])]
pub struct OpenDispute<'info> {
    pub party: Signer<'info>,
    /// CHECK: the deal's buyer — seeds derivation requires the correct key.
    pub buyer: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"deal", buyer.key().as_ref(), &deal_seed],
        bump = deal.bump
    )]
    pub deal: Account<'info, DealState>,
}

#[derive(Accounts)]
#[instruction(deal_seed: [u8; 32])]
pub struct ArbiterResolve<'info> {
    /// Must be the deal's stored platform authority (checked in handler).
    pub arbiter: Signer<'info>,
    /// CHECK: the deal's buyer — seeds derivation requires the correct key.
    pub buyer: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"deal", buyer.key().as_ref(), &deal_seed],
        bump = deal.bump
    )]
    pub deal: Account<'info, DealState>,
    #[account(
        mut,
        seeds = [b"escrow_state", deal.key().as_ref()],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowStateAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow_state
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    /// Fee vault — validated against the deal's platform authority in the handler.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = arbiter
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = deal.seller
    )]
    pub seller_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ============ STATE ============

#[account]
#[derive(InitSpace)]
pub struct DealState {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    /// Platform fee receiver — set once at deal creation, cannot be changed.
    pub platform_authority: Pubkey,
    /// Platform fee in basis points (1 bp = 0.01%).
    pub platform_fee_bps: u16,
    pub status: DealStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowStateAccount {
    pub deal: Pubkey,
    pub amount: u64,
    pub status: EscrowStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum DealStatus {
    Created,
    Funded,
    Completed,
    Disputed,
    Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Deposited,
    Released,
    Refunded,
}

#[error_code]
pub enum EscrowError {
    #[msg("Fee exceeds the maximum allowed (50%)")]
    FeeTooHigh,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Deal is not in the required status")]
    InvalidDealStatus,
    #[msg("Escrow is not in the required status")]
    InvalidEscrowStatus,
    #[msg("You are not authorized to perform this action")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
