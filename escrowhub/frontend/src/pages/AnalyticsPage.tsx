import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi, auditApi } from '../api';
import { setPageMeta } from '../seo';
import { GlassNavbar } from '../components/GlassNavbar';
import { SiteFooter } from '../components/SiteFooter';
import { GlassCard } from '../components/GlassCard';
import { GlassBadge } from '../components/GlassBadge';
import { useAuth } from '../auth';

interface AnalyticsSummary {
  deals: { total: number; funded: number; completed: number; disputed: number };
  escrow: { deposited_sol: number; released_sol: number; refunded_sol: number };
  joins: { attempts: number; successes: number; success_rate: number };
  observers_invited: number;
  screen_sharing: { sessions: number; total_seconds: number };
}

interface AuditEvent {
  id: number;
  ts: string;
  user_id?: string | null;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: any;
  ip?: string | null;
}

const ACTION_LABELS: Record<string, { label: string; emoji: string }> = {
  register: { label: 'Registered', emoji: '🆕' },
  login: { label: 'Logged in', emoji: '🔑' },
  deal_created: { label: 'Deal created', emoji: '📝' },
  deal_joined: { label: 'Joined deal', emoji: '🤝' },
  join_rejected: { label: 'Join rejected', emoji: '🚫' },
  observer_invited: { label: 'Observer invited', emoji: '👁' },
  escrow_deposited: { label: 'Escrow deposited', emoji: '💰' },
  escrow_released: { label: 'Escrow released', emoji: '✅' },
  escrow_refunded: { label: 'Escrow refunded', emoji: '↩️' },
  screen_share_started: { label: 'Screen share started', emoji: '📺' },
  screen_share_stopped: { label: 'Screen share stopped', emoji: '⏹' },
  dispute_created: { label: 'Dispute opened', emoji: '⚠️' },
  dispute_resolved: { label: 'Dispute resolved', emoji: '⚖️' },
  ai_check: { label: 'AI milestone check', emoji: '🤖' },
  workspace_created: { label: 'Workspace created', emoji: '🏢' },
  workspace_switched: { label: 'Workspace switched', emoji: '🔀' },
  'escrow.deposited': { label: 'Escrow deposited', emoji: '💰' },
  'escrow.release': { label: 'Escrow released', emoji: '✅' },
  'escrow.refund': { label: 'Escrow refunded', emoji: '↩️' },
  'dispute.open': { label: 'Dispute opened', emoji: '⚠️' },
  'dispute.resolve': { label: 'Dispute resolved', emoji: '⚖️' },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function AnalyticsPage() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setPageMeta({
      title: 'Analytics & Audit | EscrowHub',
      description: 'Escrow metrics and the tamper-evident audit trail of every security-relevant action in your workspace.',
      path: '/analytics',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Analytics', path: '/analytics' },
      ],
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, a] = await Promise.all([analyticsApi.summary(), auditApi.list()]);
        setSummary(s);
        setEvents(a.events || a.logs || []);
      } catch (err) {
        console.error('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={logout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Analytics &amp; Audit</h1>
            <p className="text-apple-muted text-sm">
              Workspace metrics and a tamper-evident trail of every security-relevant action
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-sky"></div>
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
              <GlassCard>
                <p className="text-apple-muted text-xs sm:text-sm mb-1">Join Success Rate</p>
                <p className="text-2xl sm:text-3xl font-bold text-apple-sky">
                  {summary ? Math.round(summary.joins.success_rate * 100) : 0}%
                </p>
                <p className="text-apple-muted text-xs mt-1">
                  {summary?.joins.successes ?? 0} of {summary?.joins.attempts ?? 0} attempts
                </p>
              </GlassCard>
              <GlassCard>
                <p className="text-apple-muted text-xs sm:text-sm mb-1">Escrow Deposited</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {summary ? summary.escrow.deposited_sol.toFixed(4) : '0'} SOL
                </p>
                <p className="text-apple-muted text-xs mt-1">
                  released {summary?.escrow.released_sol.toFixed(4) ?? '0'} · refunded {summary?.escrow.refunded_sol.toFixed(4) ?? '0'}
                </p>
              </GlassCard>
              <GlassCard>
                <p className="text-apple-muted text-xs sm:text-sm mb-1">Observer Invitations</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">{summary?.observers_invited ?? 0}</p>
                <p className="text-apple-muted text-xs mt-1">sent by deal parties</p>
              </GlassCard>
              <GlassCard>
                <p className="text-apple-muted text-xs sm:text-sm mb-1">Screen Share Time</p>
                <p className="text-2xl sm:text-3xl font-bold text-apple-success">
                  {summary ? formatDuration(summary.screen_sharing.total_seconds) : '0s'}
                </p>
                <p className="text-apple-muted text-xs mt-1">{summary?.screen_sharing.sessions ?? 0} sessions</p>
              </GlassCard>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Deals', value: summary?.deals.total ?? 0 },
                { label: 'Funded', value: summary?.deals.funded ?? 0 },
                { label: 'Completed', value: summary?.deals.completed ?? 0 },
                { label: 'Disputed', value: summary?.deals.disputed ?? 0 },
              ].map((s) => (
                <GlassCard key={s.label}>
                  <p className="text-apple-muted text-xs mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                </GlassCard>
              ))}
            </div>

            {/* Audit trail */}
            <GlassCard>
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Audit Trail</h2>
              {events.length === 0 ? (
                <p className="text-apple-muted text-sm text-center py-8">
                  No audit events yet. Create deals, invite observers or run a live session.
                </p>
              ) : (
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {events.map((e) => {
                    const meta = ACTION_LABELS[e.action] || { label: e.action, emoji: '•' };
                    return (
                      <div
                        key={e.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 bg-white/5 rounded-xl text-sm"
                      >
                        <span className="text-base">{meta.emoji}</span>
                        <span className="text-white font-medium">{meta.label}</span>
                        {e.resource_type === 'deal' && e.resource_id && (
                          <button
                            onClick={() => navigate(`/deals/${e.resource_id}/live`)}
                            className="font-mono text-xs text-apple-sky hover:text-white"
                          >
                            {e.resource_id.slice(0, 12)}…
                          </button>
                        )}
                        {e.details && typeof e.details === 'object' && Object.keys(e.details).length > 0 && (
                          <span className="text-apple-muted text-xs truncate max-w-[16rem]">
                            {Object.entries(e.details)
                              .filter(([k]) => !['reason', 'email'].includes(k) || e.action.includes('join') || e.action === 'observer_invited')
                              .slice(0, 3)
                              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                              .join(' · ')}
                          </span>
                        )}
                        <span className="text-apple-muted text-xs ml-auto">{new Date(e.ts).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
