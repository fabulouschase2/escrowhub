import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { setPageMeta } from '../seo';
import { GlassInput } from '../components/GlassInput';
import { GlassButton } from '../components/GlassButton';
import { GlassCard } from '../components/GlassCard';
import { connectWallet, walletInstalled, shortAddress } from '../wallet';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setPageMeta({
      title: 'Sign in | EscrowHub',
      description: 'Sign in to EscrowHub to manage Solana escrow deals, review work over live screen share, and release payments when milestones are met.',
      path: '/login',
    });
  }, []);

  const handleConnectPhantom = async () => {
    setError('');
    try {
      const pubkey = await connectWallet();
      setWalletAddress(pubkey);
    } catch (err: any) {
      setError(err.message || 'Could not connect Phantom');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password, walletAddress || undefined);
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <GlassCard className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-apple-sky flex items-center justify-center shadow-sky">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isRegister ? 'Create your EscrowHub account' : 'Sign in to EscrowHub'}
          </h1>
          <p className="text-apple-muted text-sm">
            Escrow payments on Solana: on-chain deposits, live screen-share reviews, and dispute resolution.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-apple-danger/10 border border-apple-danger/30 rounded-xl text-apple-danger text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <GlassInput
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@example.com"
            required
          />

          <GlassInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
          />

          {isRegister && (
            <>
              <GlassInput
                label="Solana Wallet Address (Optional)"
                type="text"
                value={walletAddress}
                onChange={setWalletAddress}
                placeholder="Enter your Solana public key"
              />
              {walletInstalled() && !walletAddress && (
                <GlassButton variant="secondary" type="button" onClick={handleConnectPhantom} className="w-full">
                  Connect Phantom Wallet
                </GlassButton>
              )}
              {walletAddress && (
                <p className="text-apple-success text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-apple-success"></span>
                  Phantom connected: <span className="font-mono">{shortAddress(walletAddress)}</span>
                </p>
              )}
            </>
          )}

          <GlassButton
            type="submit"
            loading={loading}
            className="w-full"
          >
            {isRegister ? 'Create Account' : 'Sign In'}
          </GlassButton>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-apple-muted hover:text-white text-sm transition-colors"
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}