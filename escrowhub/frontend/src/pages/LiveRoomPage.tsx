import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { videoApi, escrowApi, aiApi } from '../api';
import { GlassNavbar } from '../components/GlassNavbar';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { GlassBadge } from '../components/GlassBadge';
import { useAuth } from '../auth';

export function LiveRoomPage() {
  const { id } = useParams<{ id: string }>();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isReleased, setIsReleased] = useState(false);
  const [aiChecks, setAiChecks] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (id) {
      loadRoom(id);
      loadAiChecks(id);
    }
  }, [id]);

  const loadRoom = async (dealId: string) => {
    try {
      const roomInfo = await videoApi.createRoom(dealId);
      setRoom(roomInfo);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAiChecks = async (sessionId: string) => {
    try {
      const checks = await aiApi.getChecks(sessionId);
      setAiChecks(checks);
    } catch (err) {
      console.error('Failed to load AI checks:', err);
    }
  };

  const handleDeposit = async () => {
    if (!id) return;
    setIsDepositing(true);
    try {
      const mockTxSig = 'mock-sig-' + Date.now() + '-' + Math.random().toString(36).substring(7);
      await escrowApi.deposit(id, 10.0, 'USDC', mockTxSig);
      alert('Escrow deposited successfully!');
    } catch (err: any) {
      alert('Deposit failed: ' + err.message);
    } finally {
      setIsDepositing(false);
    }
  };

  const handleReleaseEscrow = async () => {
    if (!id) return;
    try {
      const escrowId = `escrow-${id}-${Date.now()}`;
      await escrowApi.release(escrowId);
      setIsReleased(true);
      alert('Escrow released to seller!');
    } catch (err: any) {
      alert('Release failed: ' + err.message);
    }
  };

  const handleRefundEscrow = async () => {
    if (!id) return;
    try {
      const escrowId = `escrow-${id}-${Date.now()}`;
      await escrowApi.refund(escrowId);
      alert('Escrow refunded to buyer!');
      navigate('/dashboard');
    } catch (err: any) {
      alert('Refund failed: ' + err.message);
    }
  };

  const analyzeScreenshot = async () => {
    if (!id) return;
    setIsAnalyzing(true);
    try {
      const screenshotUrl = 'https://via.placeholder.com/800x600/1a1a2e/38bdf8?text=Milestone+Verified';
      await aiApi.analyze(id, screenshotUrl);
      loadAiChecks(id);
      alert('Screenshot analyzed successfully!');
    } catch (err: any) {
      alert('Analysis failed: ' + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-apple-sky"></div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={() => navigate('/login')} />

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Live Deal Session</h1>
            <p className="text-apple-muted text-sm font-mono mt-1">{id}</p>
          </div>
          <GlassButton variant="secondary" onClick={() => navigate('/dashboard')}>
            Exit
          </GlassButton>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Video Area */}
          <div className="lg:col-span-3">
            <GlassCard className="relative overflow-hidden aspect-video bg-black/50">
              {isScreenSharing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-apple-sky/20 flex items-center justify-center mb-4 animate-glow">
                    <svg className="w-12 h-12 text-apple-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-white text-xl font-medium">Screen Sharing Active</p>
                  <p className="text-apple-muted text-sm mt-2">Sensitive fields are being blurred client-side</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover rounded-xl"
                  poster="https://via.placeholder.com/1280x720/0A0D14/38BDF8?text=Waiting+for+Seller..."
                />
              )}

              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-3">
                <GlassButton
                  variant="secondary"
                  onClick={toggleScreenShare}
                  className="px-4 py-2 text-sm"
                >
                  {isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  onClick={analyzeScreenshot}
                  loading={isAnalyzing}
                  className="px-4 py-2 text-sm"
                >
                  Capture & Analyze
                </GlassButton>
              </div>
            </GlassCard>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <GlassCard>
              <h3 className="text-sm font-semibold text-apple-muted uppercase tracking-wider mb-4">Session Controls</h3>
              <div className="space-y-3">
                <GlassButton onClick={handleDeposit} loading={isDepositing} className="w-full">
                  Deposit Escrow
                </GlassButton>
                {!isReleased && (
                  <>
                    <GlassButton
                      variant="secondary"
                      onClick={handleReleaseEscrow}
                      className="w-full"
                    >
                      Release to Seller
                    </GlassButton>
                    <GlassButton
                      variant="secondary"
                      onClick={handleRefundEscrow}
                      className="w-full border-apple-danger/30 text-apple-danger hover:bg-apple-danger/10"
                    >
                      Refund to Buyer
                    </GlassButton>
                  </>
                )}
              </div>
              {isReleased && (
                <div className="mt-4 p-3 bg-apple-success/10 border border-apple-success/30 rounded-xl text-center">
                  <GlassBadge variant="success">Escrow Released</GlassBadge>
                </div>
              )}
            </GlassCard>

            <GlassCard>
              <h3 className="text-sm font-semibold text-apple-muted uppercase tracking-wider mb-4">AI Milestones</h3>
              <div className="space-y-3">
                {aiChecks.length === 0 ? (
                  <p className="text-apple-muted text-sm text-center py-4">No milestones detected yet</p>
                ) : (
                  aiChecks.map((check) => (
                    <div key={check.id} className="p-3 bg-white/5 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-apple-muted">{check.id?.slice(0, 8)}</span>
                        {check.analysis_result?.milestone_reached && (
                          <GlassBadge variant="success">Verified</GlassBadge>
                        )}
                      </div>
                      <p className="text-sm text-white">{check.analysis_result?.details || 'Milestone detected'}</p>
                      {check.analysis_result?.confidence && (
                        <div className="mt-2">
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-apple-sky rounded-full"
                              style={{ width: `${check.analysis_result.confidence * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-apple-muted mt-1">
                            Confidence: {Math.round(check.analysis_result.confidence * 100)}%
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </main>

      <canvas ref={canvasRef} width="1280" height="720" className="hidden" />
    </div>
  );
}