use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod escrow {
    use super::*;

    /// Initialize the escrow account (optional, we can use PDA directly)
    // We'll use a PDA for escrow state per deal.

    /// Deposit funds into escrow
    /// buyer sends tokens to the escrow PDA
    #[access_control(ctx.accounts.validate(&ctx.params.buyer_key))]
    pub fn deposit_escrow(ctx: Context<DepositEscrow>, amount: u64) -> Result<()> {
        // Transfer tokens from buyer's token account to escrow's token account
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                to: ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        );
        anchor_spl::token::transfer(cpi_ctx, amount)?;

        // Update escrow state (optional, we can just rely on token account balance)
        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.amount = amount;
        escrow_state.status = EscrowState::Deposited;
        Ok(())
    }

    /// Release escrow to seller
    #[access_control(ctx.accounts.validate(&ctx.params.buyer_key))]
    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let escrow_state = &ctx.accounts.escrow_state;
        require!(escrow_state.status == EscrowState::Deposited, EscrowError::NotDeposited);

        // Transfer tokens from escrow to seller
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.seller_token_account.to_account_info(),
                authority: ctx.accounts.escrow_signer.to_account_info(), // PDA signer
            },
        );
        // We need to sign with the PDA; we'll use the seeds.
        let seeds = &[
            b"escrow",
            ctx.accounts.deal.id.as_ref(),
            &[ctx.bumps.escrow_signer],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx_with_signer = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.seller_token_account.to_account_info(),
                authority: ctx.accounts.escrow_signer.to_account_info(),
            },
            signer_seeds,
        );
        anchor_spl::token::transfer(cpi_ctx_with_signer, escrow_state.amount)?;

        // Update state
        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.status = EscrowState::Released;
        Ok(())
    }

    /// Refund escrow to buyer (on dispute)
    #[access_control(ctx.accounts.validate(&ctx.params.buyer_key))]
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        let escrow_state = &ctx.accounts.escrow_state;
        require!(escrow_state.status == EscrowState::Deposited, EscrowError::NotDeposited);

        // Transfer tokens from escrow back to buyer
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.escrow_signer.to_account_info(),
            },
        );
        let seeds = &[
            b"escrow",
            ctx.accounts.deal.id.as_ref(),
            &[ctx.bumps.escrow_signer],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx_with_signer = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.escrow_signer.to_account_info(),
            },
            signer_seeds,
        );
        anchor_spl::token::transfer(cpi_ctx_with_signer, escrow_state.amount)?;

        // Update state
        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.status = EscrowState::Refunded;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct DepositEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_signer
    )]
    pub escrow_token_account: Account<'info, anchor_spl::token::TokenAccount>,
    /// CHECK: This is the PDA that signs for the escrow token account
    #[account(
        seeds = [b"escrow", deal.id.as_ref()],
        bump
    )]
    pub escrow_signer: UncheckedAccount<'info>,
    #[account(mut)]
    pub deal: Account<'info, DealState>,
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
    pub associated_token_program: Program<'info, anchor_spl::token::AssociatedToken>,
    pub system_program: Program<'info, System>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow_state", deal.id.as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", deal.id.as_ref()],
        bump
    )]
    pub escrow_signer: UncheckedAccount<'info>,
    #[account(mut)]
    pub escrow_token_account: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub seller_token_account: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub deal: Account<'info, DealState>,
    #[account(
        mut,
        seeds = [b"escrow_state", deal.id.as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", deal.id.as_ref()],
        bump
    )]
    pub escrow_signer: UncheckedAccount<'info>,
    #[account(mut)]
    pub escrow_token_account: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub deal: Account<'info, DealState>,
    #[account(
        mut,
        seeds = [b"escrow_state", deal.id.as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
}

#[account]
#[derive(InitSpace)]
pub struct DealState {
    pub id: [u8; 32], // UUID bytes
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub platform_fee_pct: u16, // basis points? we'll store as u16 percent * 100? For simplicity, store percent * 100.
    pub status: DealStatus,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub amount: u64,
    pub status: EscrowStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum DealStatus {
    Created,
    Active,
    Completed,
    Disputed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Deposited,
    Released,
    Refunded,
}

#[error_code]
pub enum EscrowError {
    #[msg("Escrow is not deposited")]
    NotDeposited,
    #[msg("Unauthorized")]
    Unauthorized,
}
