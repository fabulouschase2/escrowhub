import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { dealsApi } from '../api';
import { GlassNavbar } from '../components/GlassNavbar';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { GlassBadge } from '../components/GlassBadge';

interface Deal {
  id: string;
  buyer_id: string;
  seller_id: string;
  amount?: number;
  currency?: string;
  platform_fee_pct?: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDeals();
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

  const stats = {
    total: deals.length,
    active: deals.filter(d => d.status === 'created' || d.status === 'funded').length,
    completed: deals.filter(d => d.status === 'completed').length,
  };

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={logout} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
            <p className="text-apple-muted">Manage your escrow deals and transactions</p>
          </div>
          <GlassButton onClick={() => navigate('/deals/create')}>
            Create New Deal
          </GlassButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-apple-muted text-sm mb-1">Total Deals</p>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-apple-sky/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-apple-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-apple-muted text-sm mb-1">Active Deals</p>
                <p className="text-3xl font-bold text-white">{stats.active}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-apple-warning/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-apple-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">Your Deals</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-sky"></div>
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-apple-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-apple-muted mb-4">No deals yet</p>
              <GlassButton onClick={() => navigate('/deals/create')}>
                Create Your First Deal
              </GlassButton>
            </div>
          ) : (
            <div className="space-y-3">
              {deals.map((deal) => (
                <div key={deal.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/8 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-lg bg-apple-sky/20 flex items-center justify-center">
                      <span className="text-apple-sky font-mono text-sm">{deal.id.slice(0, 4)}</span>
                    </div>
                    <div>
                      <p className="text-white font-medium font-mono text-sm">{deal.id}</p>
                      <p className="text-apple-muted text-xs">{new Date(deal.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    {deal.amount && (
                      <div className="text-right">
                        <p className="text-white font-semibold">{deal.amount} {deal.currency || 'USDC'}</p>
                        <p className="text-apple-muted text-xs">Fee: {deal.platform_fee_pct || 10}%</p>
                      </div>
                    )}
                    <GlassBadge variant={
                      deal.status === 'completed' ? 'success' :
                      deal.status === 'disputed' ? 'danger' :
                      deal.status === 'funded' ? 'info' : 'warning'
                    }>
                      {deal.status}
                    </GlassBadge>
                    <Link
                      to={`/deals/${deal.id}/live`}
                      className="text-apple-sky hover:text-white text-sm font-medium transition-colors"
                    >
                      Enter Live Room
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </main>
    </div>
  );
}