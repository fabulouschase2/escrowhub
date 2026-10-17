const anchor = require("@coral-xyz/anchor");
const { Program } = require("@coral-xyz/anchor");
const { Escrow } = require("../target/types/escrow");
const { PublicKey, SystemProgram, Keypair } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } = require("@solana/spl-token");

describe("escrow", () => {
  let program;
  let buyer;
  let seller;
  let usdcMint;
  let feeVaultAuthority;
  let dealPda;
  let escrowStatePda;
  let escrowVault;
  let feeVault;
  let buyerTokenAccount;
  let sellerTokenAccount;
  let bump;
  let escrowStateBump;

  before(async () => {
    // Configure the client to use localnet
    anchor.setProvider(anchor.AnchorProvider.env());
    program = anchor.workspace.Escrow;
    buyer = Keypair.generate();
    seller = Keypair.generate();
    usdcMint = Keypair.generate();
    feeVaultAuthority = Keypair.generate();
  });

  it("should create a new deal", async () => {
    // Airdrop SOL to buyer
    const airdropTx = await anchor.getProvider().connection.requestAirdrop(buyer.publicKey, 10_000_000_000);
    await anchor.getProvider().connection.confirmTransaction(airdropTx);

    // Create USDC mint
    const mintTx = await program.methods
      .initializeDeal(100) // 1% fee
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        deal: null,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    // Get the deal PDA
    [dealPda, bump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), buyer.publicKey.toBuffer()],
      program.programId
    );

    const deal = await program.account.dealState.fetch(dealPda);
    assert.equal(deal.buyer.toString(), buyer.publicKey.toString());
    assert.equal(deal.seller.toString(), seller.publicKey.toString());
    assert.equal(deal.platformFeeBps, 100);
    assert.equal(deal.status.toNumber(), 0); // Created
  });

  it("should deposit into escrow", async () => {
    // Create USDC mint account
    await program.methods
      .initializeDeal(100)
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        deal: null,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    // Create token accounts for buyer and seller
    buyerTokenAccount = await getAssociatedTokenAddress(usdcMint.publicKey, buyer.publicKey);
    sellerTokenAccount = await getAssociatedTokenAddress(usdcMint.publicKey, seller.publicKey);

    // Create USDC mint
    const createMintTx = await anchor.getProvider().connection.requestAirdrop(usdcMint.publicKey, 10_000_000_000);
    await anchor.getProvider().connection.confirmTransaction(createMintTx);

    // Create buyer's ATA
    const createBuyerAtaIx = createAssociatedTokenAccountInstruction(
      buyer.publicKey,
      buyerTokenAccount,
      buyer.publicKey,
      usdcMint.publicKey
    );

    // Create seller's ATA
    const createSellerAtaIx = createAssociatedTokenAccountInstruction(
      seller.publicKey,
      sellerTokenAccount,
      seller.publicKey,
      usdcMint.publicKey
    );

    // Create fee vault
    feeVault = await getAssociatedTokenAddress(usdcMint.publicKey, feeVaultAuthority.publicKey);
    const createFeeVaultIx = createAssociatedTokenAccountInstruction(
      buyer.publicKey,
      feeVault,
      feeVaultAuthority.publicKey,
      usdcMint.publicKey
    );

    // Deposit 100 USDC
    const depositTx = await program.methods
      .depositEscrow(new anchor.BN(100_000_000)) // 100 with 8 decimals
      .accounts({
        buyer: buyer.publicKey,
        deal: dealPda,
        buyerTokenAccount,
        escrowVault: null,
        escrowState: null,
        mint: usdcMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: feeVault, isSigner: false, isWritable: true },
        { pubkey: feeVaultAuthority.publicKey, isSigner: false, isWritable: true },
      ])
      .signers([buyer])
      .rpc();

    // Get escrow state PDA
    [escrowStatePda, escrowStateBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_state"), dealPda.toBuffer()],
      program.programId
    );

    const escrowState = await program.account.escrowStateAccount.fetch(escrowStatePda);
    assert.equal(escrowState.amount.toNumber(), 100_000_000);
    assert.equal(escrowState.status.toNumber(), 0); // Deposited
  });

  it("should release escrow with fee split", async () => {
    // Get PDA bumps
    [dealPda, bump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), buyer.publicKey.toBuffer()],
      program.programId
    );
    [escrowStatePda, escrowStateBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_state"), dealPda.toBuffer()],
      program.programId
    );

    // Release escrow
    const releaseTx = await program.methods
      .releaseEscrow()
      .accounts({
        buyer: buyer.publicKey,
        deal: dealPda,
        escrowState: escrowStatePda,
        escrowVault: null,
        feeVault: null,
        feeVaultAuthority: feeVaultAuthority.publicKey,
        sellerTokenAccount,
        mint: usdcMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([])
      .signers([buyer])
      .rpc();

    const deal = await program.account.dealState.fetch(dealPda);
    assert.equal(deal.status.toNumber(), 4); // Completed
  });

  it("should refund escrow", async () => {
    // Need to reinitialize for refund test
    // ... (similar to deposit test but with refund)
  });

  it("should open dispute", async () => {
    // ... (test dispute opening)
  });
});
