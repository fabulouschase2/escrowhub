import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { dealsApi } from '../api';
import { setPageMeta } from '../seo';
import { GlassNavbar } from '../components/GlassNavbar';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { GlassInput } from '../components/GlassInput';
import { SiteFooter } from '../components/SiteFooter';
import { useAuth } from '../auth';

export function JoinDealPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const autoJoinRef = useRef(false);

  useEffect(() => {
    setPageMeta({
      title: 'Join a Deal | EscrowHub',
      description: 'Join an EscrowHub deal with the invitation code you received from the deal creator.',
      path: '/join',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Join a Deal', path: '/join' },
      ],
    });
  }, []);

  const performJoin = async (codeValue: string) => {
    const trimmed = codeValue.trim();
    if (!trimmed) {
      setError('Please enter an invitation code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Codes are unique per deal and resolved server-side, so joining works
      // with or without the deal id in the URL.
      if (id) {
        await dealsApi.join(id, trimmed);
        navigate(`/deals/${id}/live`);
      } else {
        const joined = await dealsApi.joinByCode(trimmed);
        navigate(`/deals/${joined.deal_id}/live`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to join. Please check your invitation code.');
    } finally {
      setLoading(false);
    }
  };

  // A shared link (?code=inv-...) fills the code and joins right away.
  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode && !autoJoinRef.current) {
      autoJoinRef.current = true;
      performJoin(urlCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performJoin(code);
  };

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={() => navigate('/login')} />

      <main className="max-w-md mx-auto px-6 pt-20 pb-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-apple-sky/15 border border-apple-sky/20 flex items-center justify-center shadow-sky-sm">
            <svg className="w-9 h-9 text-apple-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Join a Deal</h1>
          <p className="text-apple-muted text-sm leading-relaxed">
            Paste the invitation code you received.<br />Without it, this deal stays locked.
          </p>
        </div>

        <GlassCard>
          <form onSubmit={handleJoin} className="space-y-5">
            {error && (
              <div className="p-3 bg-apple-danger/10 border border-apple-danger/30 rounded-xl text-apple-danger text-sm flex items-start space-x-2">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <GlassInput
              label="Invitation Code"
              value={code}
              onChange={setCode}
              placeholder="inv-xxxxxxxx-..."
              required
            />

            <GlassButton type="submit" loading={loading} className="w-full">
              {loading ? 'Verifying code…' : 'Unlock & Join Deal'}
            </GlassButton>

            <div className="pt-4 border-t border-white/10 flex items-center justify-center space-x-2 text-apple-muted text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Codes are unique per deal and verified server-side</span>
            </div>
          </form>
        </GlassCard>

        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-apple-muted hover:text-white text-sm transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
