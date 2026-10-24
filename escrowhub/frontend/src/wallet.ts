import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ---- Phantom wallet provider ----------------------------------------------

interface PhantomResponse {
  publicKey?: { toString(): string } | null;
  signature?: string;
}

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<PhantomResponse>;
  disconnect(): Promise<void>;
  signAndSendTransaction(tx: Transaction): Promise<PhantomResponse>;
  on?(event: string, handler: (...args: any[]) => void): void;
}

export function getPhantom(): PhantomProvider | null {
  const w = window as any;
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
}

export function walletInstalled(): boolean {
  return getPhantom() !== null;
}

export async function connectWallet(): Promise<string> {
  const provider = getPhantom();
  if (!provider) {
    throw new Error('Phantom wallet not found. Install it from https://phantom.app');
  }
  const resp = await provider.connect();
  const pubkey = resp?.publicKey?.toString();
  if (!pubkey) throw new Error('Wallet connected but no public key returned');
  return pubkey;
}

export async function disconnectWallet(): Promise<void> {
  const provider = getPhantom();
  if (provider) await provider.disconnect().catch(() => {});
}

// ---- Real on-chain SOL transfer (deposit into escrow) ---------------------

export interface EscrowChainConfig {
  cluster: string;
  rpc_url: string;
  escrow_authority: string;
  fee_wallet: string | null;
}

export function clusterRpcUrl(cluster: string): string {
  switch (cluster) {
    case 'mainnet-beta': return 'https://api.mainnet-beta.solana.com';
    case 'testnet': return 'https://api.testnet.solana.com';
    case 'localnet': return 'http://127.0.0.1:8899';
    default: return 'https://api.devnet.solana.com';
  }
}

export function explorerTxUrl(cluster: string, signature: string): string {
  if (!signature) return '';
  if (cluster === 'mainnet-beta') return `https://solscan.io/tx/${signature}`;
  if (cluster === 'localnet') return '';
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

/**
 * Sends a REAL SOL transfer from the connected Phantom wallet to the escrow
 * authority, confirms it on-chain and returns the real transaction signature.
 */
export async function sendDepositTransaction(
  config: EscrowChainConfig,
  fromPublicKey: string,
  amountSol: number,
): Promise<string> {
  const provider = getPhantom();
  if (!provider) throw new Error('Phantom wallet not connected');

  const connection = new Connection(clusterRpcUrl(config.cluster), 'confirmed');
  const from = new PublicKey(fromPublicKey);
  const to = new PublicKey(config.escrow_authority);
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({
    feePayer: from,
    blockhash,
    lastValidBlockHeight,
  }).add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }));

  const resp = await provider.signAndSendTransaction(tx);
  const signature = resp?.signature;
  if (!signature) throw new Error('Wallet did not return a transaction signature');

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

export function shortAddress(addr: string | null | undefined): string {
  if (!addr) return '';
  return addr.length > 10 ? `${addr.slice(0, 5)}...${addr.slice(-4)}` : addr;
}
