import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { dealsApi } from '../api';
import { setPageMeta } from '../seo';
import { GlassNavbar } from '../components/GlassNavbar';
import { SiteFooter } from '../components/SiteFooter';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { GlassBadge } from '../components/GlassBadge';

interface Deal {
  id: string;
  buyer_id: string;
  seller_id: string;
  buyer_email?: string | null;
  seller_email?: string | null;
  amount?: number;
  currency?: string;
  platform_fee_pct?: number;
  status: string;
  created_at: string;
  updated_at: string;
  invitation_code?: string | null;
  participants?: string[] | null;
  observers?: string[] | null;
}

type RoleFilter = 'all' | 'buying' | 'selling';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RoleFilter>('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadDeals();
  }, []);

  useEffect(() => {
    setPageMeta({
      title: 'Dashboard | EscrowHub',
      description: 'Your EscrowHub deals: track escrow status for deals you are buying and selling, and enter live deal rooms.',
      path: '/dashboard',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Dashboard', path: '/dashboard' },
      ],
    });
  }, []);

  const loadDeals = async () => {
    try {
      const data = await dealsApi.list();
      setDeals(data.deals || []);
    } catch (err) {
      console.error('Failed to load deals:', err);
    } finally {
      setLoading(false);
    }
  };

  // The backend resolves the viewer's relationship to each deal.
  const roleOf = (deal: Deal): 'buyer' | 'seller' | null => {
    if (!user) return null;
    const viewerRole = (deal as any).viewer_role as string | undefined;
    if (viewerRole === 'buyer' || viewerRole === 'seller') return viewerRole;
    if (deal.buyer_email && deal.buyer_email === user.email) return 'buyer';
    if (deal.seller_email && deal.seller_email === user.email) return 'seller';
    return null;
  };

  const myDeals = deals.filter((d) => roleOf(d) !== null);
  // Tab keys ('buying'/'selling') map to deal roles ('buyer'/'seller').
  const roleForFilter = filter === 'buying' ? 'buyer' : filter === 'selling' ? 'seller' : null;
  const visibleDeals = filter === 'all' ? deals : myDeals.filter((d) => roleOf(d) === roleForFilter);

  const stats = {
    total: deals.length,
    buying: myDeals.filter((d) => roleOf(d) === 'buyer').length,
    selling: myDeals.filter((d) => roleOf(d) === 'seller').length,
    completed: deals.filter((d) => d.status === 'completed').length,
  };

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={logout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
            <p className="text-apple-muted">
              Welcome back{user?.email ? `, ${user.email}` : ''}. Manage your escrow deals:
            </p>
          </div>
          <div className="flex flex-wrap space-x-3">
            <GlassButton variant="secondary" onClick={() => navigate('/join')}>
              <span className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span>Join with Code</span>
              </span>
            </GlassButton>
            <GlassButton onClick={() => navigate('/deals/create')}>
              Create New Deal
            </GlassButton>
          </div>
        </div>

        {/* Role stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-apple-muted text-sm mb-1">All Deals</p>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                <svg className="w-6 h-6 text-apple-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-apple-muted text-sm mb-1">You're Buying</p>
                <p className="text-3xl font-bold text-apple-sky">{stats.buying}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-apple-sky/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-apple-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-apple-muted text-sm mb-1">You're Selling</p>
                <p className="text-3xl font-bold text-apple-success">{stats.selling}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-apple-success/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-apple-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-apple-muted text-sm mb-1">Completed</p>
                <p className="text-3xl font-bold text-white">{stats.completed}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-apple-success/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-apple-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </GlassCard>
        </div>

        <GlassCard>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-xl font-semibold text-white">Deals</h2>
            <div className="flex space-x-2">
              {([
                { key: 'all', label: `All (${stats.total})` },
                { key: 'buying', label: `Buying (${stats.buying})` },
                { key: 'selling', label: `Selling (${stats.selling})` },
              ] as { key: RoleFilter; label: string }[]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    filter === tab.key
                      ? 'bg-apple-sky text-white shadow-sky-sm'
                      : 'bg-white/5 text-apple-muted hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-sky"></div>
            </div>
          ) : visibleDeals.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-apple-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-apple-muted mb-4">
                {filter === 'all' ? 'No deals yet' : filter === 'buying' ? "You're not buying any deals yet" : "You're not selling any deals yet"}
              </p>
              {filter === 'all' && (
                <GlassButton onClick={() => navigate('/deals/create')}>
                  Create Your First Deal
                </GlassButton>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleDeals.map((deal) => {
                const role = roleOf(deal);
                const counterparty =
                  role === 'buyer'
                    ? deal.seller_email || `Seller ${deal.seller_id?.slice(0, 8)}...`
                    : role === 'seller'
                    ? deal.buyer_email || `Buyer ${deal.buyer_id?.slice(0, 8)}...`
                    : 'Unknown party';

                return (
                  <div key={deal.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-lg bg-apple-sky/20 flex items-center justify-center">
                        <span className="text-apple-sky font-mono text-sm">{deal.id.slice(0, 4)}</span>
                      </div>
                      <div>
                        <p className="text-white font-medium font-mono text-sm">{deal.id.slice(0, 18)}...</p>
                        <p className="text-apple-muted text-xs">{new Date(deal.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center space-x-4 gap-2">
                      {/* Your role in this deal */}
                      {role === 'buyer' && (
                        <GlassBadge variant="info" className="!bg-apple-sky/20 !text-apple-sky !border-apple-sky/30">
                          🛒 You're Buying
                        </GlassBadge>
                      )}
                      {role === 'seller' && (
                        <GlassBadge variant="success" className="!bg-apple-success/20 !text-apple-success !border-apple-success/30">
                          💼 You're Selling
                        </GlassBadge>
                      )}
                      {!role && <GlassBadge>👤 Observer</GlassBadge>}

                      {/* Counterparty */}
                      <div className="text-right">
                        <p className="text-apple-muted text-xs">
                          {role === 'buyer' ? 'Seller' : 'Buyer'}:
                        </p>
                        <p className="text-white text-sm">{counterparty}</p>
                      </div>

                      {deal.amount ? (
                        <div className="text-right">
                          <p className="text-white font-semibold">{deal.amount} {deal.currency || 'USDC'}</p>
                          <p className="text-apple-muted text-xs">Fee: {deal.platform_fee_pct || 10}%</p>
                        </div>
                      ) : null}

                      <GlassBadge
                        variant={
                          deal.status === 'completed' ? 'success' :
                          deal.status === 'disputed' ? 'danger' :
                          deal.status === 'funded' ? 'info' : 'warning'
                        }
                      >
                        {deal.status}
                      </GlassBadge>

                      {/* Check if the user is authorized to enter directly or needs to join via invitation */}
                      {true ? (
                        <Link
                          to={`/deals/${deal.id}/live`}
                          className="text-apple-sky hover:text-white text-sm font-medium transition-colors"
                        >
                          Enter Live Room →
                        </Link>
                      ) : (
                        <Link
                          to={`/deals/${deal.id}/join`}
                          className="px-3 py-1.5 rounded-lg bg-apple-sky/20 border border-apple-sky/30 text-apple-sky hover:bg-apple-sky/30 text-sm font-medium transition-all"
                        >
                          Join Deal Code →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </main>
      <SiteFooter />
    </div>
  );
}
