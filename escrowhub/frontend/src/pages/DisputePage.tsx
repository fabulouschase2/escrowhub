import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { disputesApi, aiApi } from '../api';
import { GlassNavbar } from '../components/GlassNavbar';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { GlassBadge } from '../components/GlassBadge';
import { GlassInput } from '../components/GlassInput';
import { useAuth } from '../auth';

export function DisputePage() {
  const { dealId } = useParams<{ dealId: string }>();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newDispute, setNewDispute] = useState({ reason: '', evidenceUrls: '' });
  const [aiChecks, setAiChecks] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (dealId) {
      loadDisputes(dealId);
      loadAiChecks(dealId);
    }
  }, [dealId]);

  const loadDisputes = async (dealId: string) => {
    try {
      const data = await disputesApi.get(dealId);
      setDisputes(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAiChecks = async (dealId: string) => {
    setAiLoading(true);
    try {
      const checks = await aiApi.getChecks(dealId);
      setAiChecks(checks);
    } catch (err) {
      console.error('Failed to load AI checks:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealId || !user) return;

    try {
      await disputesApi.create(
        dealId,
        user.id,
        newDispute.reason,
        newDispute.evidenceUrls.split(',').map(s => s.trim()).filter(Boolean)
      );
      setShowCreate(false);
      setNewDispute({ reason: '', evidenceUrls: '' });
      loadDisputes(dealId);
    } catch (err: any) {
      alert('Failed to create dispute: ' + err.message);
    }
  };

  const handleResolve = async (disputeId: string, resolution: string) => {
    try {
      await disputesApi.resolve(disputeId, resolution);
      loadDisputes(dealId!);
    } catch (err: any) {
      alert('Failed to resolve: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={() => navigate('/login')} />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <button onClick={() => navigate('/dashboard')} className="text-apple-muted hover:text-white text-sm mb-4 flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">Disputes</h1>
          <p className="text-apple-muted font-mono text-sm">Deal: {dealId}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-apple-danger/10 border border-apple-danger/30 rounded-xl text-apple-danger text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Open Disputes</h2>
          <GlassButton onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : 'Create Dispute'}
          </GlassButton>
        </div>

        {showCreate && (
          <GlassCard className="mb-6">
            <form onSubmit={handleCreateDispute} className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Create New Dispute</h3>
              <GlassInput
                label="Reason"
                type="text"
                value={newDispute.reason}
                onChange={(v) => setNewDispute({ ...newDispute, reason: v })}
                placeholder="Describe the issue..."
                required
              />
              <GlassInput
                label="Evidence URLs (comma-separated)"
                type="text"
                value={newDispute.evidenceUrls}
                onChange={(v) => setNewDispute({ ...newDispute, evidenceUrls: v })}
                placeholder="https://example.com/evidence1.png, https://example.com/evidence2.png"
              />
              <div className="flex space-x-4 pt-2">
                <GlassButton type="submit">Submit Dispute</GlassButton>
                <GlassButton variant="secondary" onClick={() => setShowCreate(false)}>Cancel</GlassButton>
              </div>
            </form>
          </GlassCard>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-sky"></div>
          </div>
        ) : disputes.length === 0 ? (
          <GlassCard className="text-center py-12">
            <p className="text-apple-muted mb-4">No disputes for this deal</p>
            <GlassButton onClick={() => setShowCreate(true)}>Create First Dispute</GlassButton>
          </GlassCard>
        ) : (
          <div className="space-y-4 mb-8">
            {disputes.map((dispute) => (
              <GlassCard key={dispute.id}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-mono text-apple-muted">ID: {dispute.id}</p>
                    <p className="text-sm text-apple-muted mt-1">Initiator: {dispute.initiator_id?.slice(0, 8)}...</p>
                  </div>
                  <GlassBadge variant={dispute.resolution === 'released' ? 'success' : dispute.resolution === 'refunded' ? 'danger' : 'warning'}>
                    {dispute.resolution || 'Pending'}
                  </GlassBadge>
                </div>
                <p className="text-white mb-4">{dispute.reason}</p>
                <div className="flex items-center justify-between text-sm text-apple-muted mb-4">
                  <span>Created: {new Date(dispute.created_at).toLocaleString()}</span>
                  {dispute.resolved_at && (
                    <span>Resolved: {new Date(dispute.resolved_at).toLocaleString()}</span>
                  )}
                </div>
                {dispute.evidence_urls && dispute.evidence_urls.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-apple-muted mb-2">Evidence:</p>
                    <div className="flex flex-wrap gap-2">
                      {dispute.evidence_urls.map((url: string, idx: number) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-apple-sky hover:text-white text-sm transition-colors"
                        >
                          Evidence {idx + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {!dispute.resolution && (
                  <div className="flex space-x-3 pt-4 border-t border-white/10">
                    <GlassButton onClick={() => handleResolve(dispute.id, 'released')} className="text-sm py-2">
                      Release Escrow
                    </GlassButton>
                    <GlassButton
                      variant="secondary"
                      onClick={() => handleResolve(dispute.id, 'refunded')}
                      className="text-sm py-2 border-apple-danger/30 text-apple-danger hover:bg-apple-danger/10"
                    >
                      Refund Escrow
                    </GlassButton>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}

        {/* AI Checks Section */}
        <h2 className="text-xl font-semibold text-white mb-4">AI Milestone Checks</h2>
        <GlassCard>
          {aiLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-sky mx-auto mb-4"></div>
              <p className="text-apple-muted">Loading AI analysis...</p>
            </div>
          ) : aiChecks.length === 0 ? (
            <p className="text-apple-muted text-center py-8">No AI checks yet. Screenshots from live sessions will be analyzed here.</p>
          ) : (
            <div className="space-y-4">
              {aiChecks.map((check) => (
                <div key={check.id} className="p-4 bg-white/5 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-mono text-apple-muted">
                      {check.id?.slice(0, 8)}... @ {new Date(check.created_at).toLocaleString()}
                    </span>
                    {check.analysis_result?.milestone_reached ? (
                      <GlassBadge variant="success">Milestone Reached</GlassBadge>
                    ) : (
                      <GlassBadge variant="warning">In Progress</GlassBadge>
                    )}
                  </div>
                  <pre className="text-xs bg-black/30 p-3 rounded-lg overflow-auto max-h-40 text-apple-muted">
                    {JSON.stringify(check.analysis_result, null, 2)}
                  </pre>
                  {check.screenshot_url && (
                    <a
                      href={check.screenshot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-apple-sky hover:text-white text-sm transition-colors"
                    >
                      View Screenshot
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </main>
    </div>
  );
}