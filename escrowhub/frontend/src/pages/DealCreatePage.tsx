import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dealsApi } from '../api';
import { setPageMeta } from '../seo';
import { GlassNavbar } from '../components/GlassNavbar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SiteFooter } from '../components/SiteFooter';
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
  const [createdDeal, setCreatedDeal] = useState<{ id: string; invitation_code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setPageMeta({
      title: 'Create a Deal | EscrowHub',
      description: 'Create a Solana escrow deal: set the seller, amount, and platform fee, then share the invitation code with your counterparty.',
      path: '/deals/create',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Create a Deal', path: '/deals/create' },
      ],
    });
  }, []);

  const copyInviteLink = async () => {
    if (!createdDeal) return;
    const link = `${window.location.origin}/deals/${createdDeal.id}/join?code=${encodeURIComponent(createdDeal.invitation_code)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable, the code stays visible above for manual sharing.
    }
  };

  const platformFee = amount ? (parseFloat(amount) * platformFeePct / 100).toFixed(2) : '0.00';
  const totalAmount = amount ? (parseFloat(amount) + parseFloat(platformFee)).toFixed(2) : '0.00';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const deal = await dealsApi.create(sellerId, parseFloat(amount), currency, platformFeePct);
      setCreatedDeal(deal);
      setSuccess(`Deal created successfully! Share the invitation code or link below with your counterparty.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={() => navigate('/login')} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Breadcrumbs items={[
          { name: 'Home', path: '/' },
          { name: 'Dashboard', path: '/dashboard' },
          { name: 'Create a Deal', path: '/deals/create' },
        ]} />
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create a New Escrow Deal</h1>
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

            {success && createdDeal && (
              <div className="p-5 bg-apple-success/10 border border-apple-success/30 rounded-2xl space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-apple-success/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-apple-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-apple-success font-semibold">Deal created &amp; locked</p>
                    <p className="text-apple-muted text-xs">Only people holding this invitation can get in.</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-dashed border-apple-sky/40 bg-apple-sky/5">
                  <p className="text-[10px] uppercase tracking-widest text-apple-muted mb-1.5">Invitation Code</p>
                  <p className="text-white font-mono text-xs break-all leading-relaxed select-all">{createdDeal.invitation_code}</p>
                </div>

                <GlassButton variant="secondary" onClick={copyInviteLink} className="w-full">
                  <span className="flex items-center justify-center space-x-2">
                    {copied ? (
                      <>
                        <svg className="w-4 h-4 text-apple-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Link Copied. One-Click Join</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656 0l-1.5-1.5a4 4 0 010-5.656m8.485 0l1.5 1.5a4 4 0 010 5.656m-4.243-8.485l-3-3a4 4 0 00-5.656 0" />
                        </svg>
                        <span>Copy One-Click Invitation Link</span>
                      </>
                    )}
                  </span>
                </GlassButton>

                <GlassButton
                  className="w-full"
                  onClick={() => navigate(`/deals/${createdDeal.id}/live`)}
                >
                  Enter Deal →
                </GlassButton>
              </div>
            )}

            {!success && (
              <form onSubmit={handleSubmit} className="space-y-6">
            <GlassInput
              label="Seller Wallet Address"
              value={sellerId}
              onChange={setSellerId}
              placeholder="Enter seller's Solana wallet address"
              required
            />
            <p className="text-apple-muted text-xs ml-1">The seller who will perform the account creation</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          )}
        </GlassCard>
      </main>
      <SiteFooter />
    </div>
  );
}