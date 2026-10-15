import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dealsApi } from '../api';
import { GlassNavbar } from '../components/GlassNavbar';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { GlassInput } from '../components/GlassInput';
import { useAuth } from '../auth';

export function DealCreatePage() {
  const { user } = useAuth();
  const [sellerId, setSellerId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDC');
  const [platformFeePct, setPlatformFeePct] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const platformFee = amount ? (parseFloat(amount) * platformFeePct / 100).toFixed(2) : '0.00';
  const totalAmount = amount ? (parseFloat(amount) + parseFloat(platformFee)).toFixed(2) : '0.00';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const deal = await dealsApi.create(sellerId, parseFloat(amount), currency, platformFeePct);
      setSuccess(`Deal created successfully! Deal ID: ${deal.id}`);
      setTimeout(() => {
        navigate(`/deals/${deal.id}/live`);
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={() => navigate('/login')} />

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <button onClick={() => navigate('/dashboard')} className="text-apple-muted hover:text-white text-sm mb-4 flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">Create New Deal</h1>
          <p className="text-apple-muted">Set up a secure escrow transaction</p>
        </div>

        <GlassCard>
          <div className="text-center mb-6 p-4 bg-apple-sky/10 rounded-xl border border-apple-sky/20">
            <p className="text-apple-sky font-medium">Platform Fee: {platformFeePct}%</p>
            <p className="text-apple-muted text-sm mt-1">Split 50/50 between buyer and seller</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-apple-danger/10 border border-apple-danger/30 rounded-xl text-apple-danger text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-apple-success/10 border border-apple-success/30 rounded-xl text-apple-success text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <GlassInput
              label="Seller Wallet Address"
              value={sellerId}
              onChange={setSellerId}
              placeholder="Enter seller's Solana wallet address"
              required
            />
            <p className="text-apple-muted text-xs ml-1">The seller who will perform the account creation</p>

            <div className="grid grid-cols-2 gap-4">
              <GlassInput
                label="Amount"
                type="number"
                value={amount}
                onChange={setAmount}
                placeholder="0.00"
                required
              />
              <div>
                <label className="block text-sm font-medium text-apple-muted mb-2">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="glass-input w-full cursor-pointer"
                >
                  <option value="USDC">USDC</option>
                  <option value="USDT">USDT</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-apple-muted mb-2">
                Platform Fee (%)
              </label>
              <input
                type="number"
                value={platformFeePct}
                onChange={(e) => setPlatformFeePct(Number(e.target.value))}
                min={0}
                max={50}
                className="glass-input w-full"
                required
              />
              <p className="mt-1 text-apple-muted text-xs">Default is 10%, adjustable between 0-50%</p>
            </div>

            <div className="p-4 bg-white/5 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-apple-muted">Amount:</span>
                <span className="text-white">${amount || '0.00'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-apple-muted">Platform Fee ({platformFeePct}%):</span>
                <span className="text-white">${platformFee}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between font-semibold">
                <span className="text-white">Total:</span>
                <span className="text-apple-sky">${totalAmount}</span>
              </div>
            </div>

            <GlassButton type="submit" loading={loading} className="w-full">
              Create Deal
            </GlassButton>
          </form>
        </GlassCard>
      </main>
    </div>
  );
}