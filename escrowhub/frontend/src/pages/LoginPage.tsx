import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { GlassInput } from '../components/GlassInput';
import { GlassButton } from '../components/GlassButton';
import { GlassCard } from '../components/GlassCard';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-apple-sky/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-apple-blue/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '3s' }}></div>
      </div>

      <GlassCard className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-apple-sky flex items-center justify-center shadow-sky">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">EscrowHub</h1>
          <p className="text-apple-muted">Secure blockchain escrow platform</p>
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
            <GlassInput
              label="Solana Wallet Address (Optional)"
              type="text"
              value={walletAddress}
              onChange={setWalletAddress}
              placeholder="Enter your Solana public key"
            />
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