use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Maximum platform fee: 50% (5000 basis points)
const MAX_PLATFORM_FEE_BPS: u16 = 5000;

#[program]
pub mod escrow {
    use super::*;

    /// Create a deal: buyer opens an escrow deal naming the seller and platform fee.
    /// The buyer pays rent for the deal account.
    pub fn initialize_deal(
        ctx: Context<InitializeDeal>,
        platform_fee_bps: u16,
    ) -> Result<()> {
        require!(
            platform_fee_bps <= MAX_PLATFORM_FEE_BPS,
            EscrowError::FeeTooHigh
        );

        let deal = &mut ctx.accounts.deal;
        deal.buyer = ctx.accounts.buyer.key();
        deal.seller = ctx.accounts.seller.key();
        deal.platform_fee_bps = platform_fee_bps;
        deal.status = DealStatus::Created;
        deal.bump = ctx.bumps.deal;
        Ok(())
    }

    /// Buyer deposits tokens into the escrow vault (a token account owned by the escrow PDA).
    pub fn deposit_escrow(ctx: Context<DepositEscrow>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        let deal = &ctx.accounts.deal;
        require!(
            deal.status == DealStatus::Created,
            EscrowError::InvalidDealStatus
        );
        require_keys!(deal.buyer == ctx.accounts.buyer.key(), EscrowError::Unauthorized);

        // Transfer tokens from buyer's ATA into the escrow vault.
        // The vault's authority is the escrow PDA, so no PDA signature is
        // needed here: the buyer signs the transfer out of their own account.
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

    /// Buyer releases the funds: platform fee goes to the fee vault,
    /// the remainder goes to the seller's token account.
    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        require_keys!(deal.buyer == ctx.accounts.buyer.key(), EscrowError::Unauthorized);
        require!(
            deal.status == DealStatus::Funded,
            EscrowError::InvalidDealStatus
        );

        let escrow_state = &ctx.accounts.escrow_state;
        require!(
            escrow_state.status == EscrowStatus::Deposited,
            EscrowError::InvalidEscrowStatus
        );

        let amount = escrow_state.amount;
        let fee = (amount as u128)
            .checked_mul(deal.platform_fee_bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(EscrowError::ArithmeticOverflow)? as u64;
        let seller_amount = amount
            .checked_sub(fee)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        // PDA signer seeds: the escrow PDA is the authority of the vault.
        let deal_key = deal.key();
        let bump = ctx.bumps.escrow_state;
        let seeds = &[b"escrow_state".as_ref(), deal_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        // Fee transfer (if any).
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

        // Seller payout.
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
    /// Allowed for the buyer at any time while deposited, and for either
    /// party once the deal is disputed.
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        let is_buyer = deal.buyer == ctx.accounts.refunder.key();
        let is_seller = deal.seller == ctx.accounts.refunder.key();
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

    /// Either party opens a dispute; this freezes release and enables seller refunds.
    pub fn open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        let is_buyer = deal.buyer == ctx.accounts.party.key();
        let is_seller = deal.seller == ctx.accounts.party.key();
        require!(is_buyer || is_seller, EscrowError::Unauthorized);
        require!(
            deal.status == DealStatus::Funded,
            EscrowError::InvalidDealStatus
        );

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Disputed;
        Ok(())
    }
}

// ============ ACCOUNT CONTEXTS ============

#[derive(Accounts)]
pub struct InitializeDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: seller is only stored as a pubkey; no account constraints needed.
    pub seller: UncheckedAccount<'info>,
    #[account(
        init,
        payer = buyer,
        space = 8 + DealState::INIT_SPACE,
        seeds = [b"deal", buyer.key().as_ref()],
        bump
    )]
    pub deal: Account<'info, DealState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"deal", buyer.key().as_ref()],
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
pub struct ReleaseEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"deal", buyer.key().as_ref()],
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
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = fee_vault_authority
    )]
    /// Fee vault owned by the platform authority. The platform authority
    /// receives the fee when the deal completes.
    pub fee_vault: Account<'info, TokenAccount>,
    /// CHECK: validated against the stored platform authority.
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
pub struct RefundEscrow<'info> {
    /// The buyer or the seller triggers the refund.
    #[account(mut)]
    pub refunder: Signer<'info>,
    #[account(
        mut,
        seeds = [b"deal", deal.buyer.as_ref()],
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
        associated_token::authority = deal.buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    pub party: Signer<'info>,
    #[account(
        mut,
        seeds = [b"deal", deal.buyer.as_ref()],
        bump = deal.bump
    )]
    pub deal: Account<'info, DealState>,
}

// ============ STATE ============

#[account]
#[derive(InitSpace)]
pub struct DealState {
    pub buyer: Pubkey,
    pub seller: Pubkey,
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
