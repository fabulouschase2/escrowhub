import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { videoApi, escrowApi, aiApi, dealsApi } from '../api';
import {
  connectWallet,
  getPhantom,
  sendDepositTransaction,
  shortAddress,
  explorerTxUrl,
  EscrowChainConfig,
} from '../wallet';
import { GlassNavbar } from '../components/GlassNavbar';
import { GlassCard } from '../components/GlassCard';
import { GlassButton } from '../components/GlassButton';
import { GlassBadge } from '../components/GlassBadge';
import { GlassInput } from '../components/GlassInput';
import { setPageMeta } from '../seo';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { SiteFooter } from '../components/SiteFooter';
import { useAuth } from '../auth';

interface DealInfo {
  id: string;
  buyer_email?: string | null;
  seller_email?: string | null;
  amount?: number;
  currency?: string;
  status: string;
  invitation_code?: string | null;
  viewer_role?: 'buyer' | 'seller' | 'participant' | null;
}

interface RoomState {
  is_screen_sharing: boolean;
  sharer_email?: string | null;
  current_step?: string | null;
  stream_frame?: string | null;
  sharing_started_at?: string | null;
  total_share_seconds?: number;
  updated_at?: string;
  webrtc_offer?: string | null;
  webrtc_answer?: string | null;
  webrtc_ice_candidates?: string;
}

// WebRTC signaling intervals (ms)
const SIGNAL_POLL_MS = 1000;
const ICE_POLL_MS = 500;

export function LiveRoomPage() {
  const { id } = useParams<{ id: string }>();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [deal, setDeal] = useState<DealInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiChecks, setAiChecks] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [depositSig, setDepositSig] = useState<string | null>(null);
  const [payout, setPayout] = useState<{ state: string; sig: string; explorer: string } | null>(null);
  const [chainConfig, setChainConfig] = useState<EscrowChainConfig | null>(null);
  const [walletPubkey, setWalletPubkey] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareError, setShareError] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  // True while THIS browser tab is the one capturing and sending the screen.
  // The video box must show the local preview for the sharer regardless of the
  // buyer/seller role, and the remote stream for everyone else.
  const [isLocalSharer, setIsLocalSharer] = useState(false);

  // Refs for WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs for signaling state
  const iceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  // Signatures of relayed candidates already applied, so polling never re-adds one
  const appliedCandidatesRef = useRef<Set<string>>(new Set());
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const signalPollRef = useRef<number | null>(null);
  const icePollRef = useRef<number | null>(null);
  const isSellerRef = useRef(false);
  const isBuyerRef = useRef(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // ---------- data loading ----------

  const loadDeal = useCallback(async (dealId: string) => {
    try {
      const info = await dealsApi.get(dealId);
      setDeal(info);
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes('access')) {
        navigate(`/deals/${dealId}/join`);
        return;
      }
      console.error('Failed to load deal info:', err);
    }
  }, [navigate]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const roomInfo = await videoApi.createRoom(id);
        setRoom(roomInfo.room_state);
      } catch (err: any) {
        if (err.message && err.message.toLowerCase().includes('access')) {
          navigate(`/deals/${id}/join`);
          return;
        }
        setError(err.message);
      } finally {
        setLoading(false);
      }
      loadDeal(id);
      aiApi.getChecks(id).then(res => setAiChecks(res.checks)).catch(() => {});
      escrowApi.config().then(setChainConfig).catch(() => {});
    })();
  }, [id]);

  // ---------- cleanup on unmount ----------

  useEffect(() => {
    return () => {
      stopStreaming();
      stopPolling();
    };
  }, []);

  // Per-page head data: canonical URL is unique per deal.
  useEffect(() => {
    if (!id) return;
    setPageMeta({
      title: 'Live Deal Room | EscrowHub',
      description: 'Watch the seller share their screen live, review AI milestone checks, and manage the escrow for this deal.',
      path: `/deals/${id}/live`,
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Live Deal Room', path: `/deals/${id}/live` },
      ],
    });
  }, [id]);

  // Keep the seller's preview element attached to the captured stream. The
  // preview <video> only mounts once isStreaming flips true, so the attach in
  // startScreenShare can run before the element exists. This effect catches it.
  useEffect(() => {
    if (isStreaming && localVideoRef.current && localStreamRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [isStreaming]);

  // ---------- WebRTC helpers ----------

  const createPeerConnection = (): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // TURN relay: required when the seller and buyer sit behind the same
        // NAT (no hairpinning) or symmetric NATs, where direct candidates
        // connect via ICE but the DTLS handshake can never complete.
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
      iceCandidatePoolSize: 4,
    };
    return new RTCPeerConnection(config);
  };

  const sendIceCandidate = useCallback(
    async (candidate: RTCIceCandidate, sender: 'seller' | 'buyer') => {
      if (!id) return;
      try {
        await videoApi.webrtcIceCandidate(id, candidate, sender);
      } catch (err) {
        console.warn('Failed to relay ICE candidate:', err);
      }
    },
    [id]
  );

  // ---------- Seller flow ----------

  const startScreenShare = async () => {
    if (!id) return;
    setShareError('');
    isSellerRef.current = true;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setShareError('Screen capture is not supported. Use Chrome, Edge, or Firefox on desktop.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15 }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      localStreamRef.current = stream;
      setIsStreaming(true);
      setIsLocalSharer(true);

      // Show the seller their own captured screen immediately (the preview
      // <video> mounts on this same state change, so also re-attach below).
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // If the user stops sharing from the browser's own "Stop sharing" bar,
      // reflect that in the UI and notify the room.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopStreaming();
      });

      // Update room state to indicate sharing started
      await videoApi.screenShare(id, true, 'Seller is sharing their screen live');

      // Create peer connection and add tracks
      const pc = createPeerConnection();
      pcRef.current = pc;
      isSellerRef.current = true;
      // Dev diagnostics: surface connection state for the live-room debug panel
      (window as any).__escrowPc = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Handle ICE candidates from seller side
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendIceCandidate(event.candidate, 'seller');
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('Seller connection state:', pc.connectionState);
        if (pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          setIsStreaming(false);
        }
      };

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (trickle ICE fallback)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') resolve();
          };
          // Timeout after 3 seconds
          setTimeout(resolve, 3000);
        }
      });

      // Post offer to signaling server
      await videoApi.webrtcOffer(id, pc.localDescription!.sdp!);

      // Start polling for buyer's answer
      startAnswerPolling();

      setRoom((r) => (r ? { ...r, is_screen_sharing: true, current_step: 'Seller is sharing live via WebRTC' } : r));
    } catch (err: any) {
      isSellerRef.current = false;
      setIsLocalSharer(false);
      if (err?.name !== 'NotAllowedError') {
        setShareError(`Could not start screen sharing: ${err.message || err}`);
      }
    }
  };

  const startAnswerPolling = () => {
    stopPolling();
    signalPollRef.current = window.setInterval(async () => {
      if (!id || !isSellerRef.current) return;
      try {
        const info = await videoApi.getRoom(id);
        const newRoom = info.room_state;
        setRoom(newRoom);

        // Check if buyer has sent an answer
        if (newRoom.webrtc_answer && !pcRef.current?.remoteDescription) {
          try {
            await pcRef.current?.setRemoteDescription(
              new RTCSessionDescription({ type: 'answer', sdp: newRoom.webrtc_answer })
            );
            console.log('Seller: Remote description set from answer');

            // Apply any queued ICE candidates
            const queued = pendingCandidatesRef.current;
            pendingCandidatesRef.current = [];
            for (const candidate of queued) {
              await pcRef.current?.addIceCandidate(candidate);
            }

            // Start polling for the buyer's ICE candidates (relay side)
            startIcePolling();

            // Stop polling for answer
            if (signalPollRef.current) {
              window.clearInterval(signalPollRef.current);
              signalPollRef.current = null;
            }
          } catch (err) {
            console.error('Failed to set remote description:', err);
          }
        }
      } catch {
        // Transient error, retry next tick
      }
    }, SIGNAL_POLL_MS);
  };

  // ---------- Buyer flow ----------

  useEffect(() => {
    if (!id || !room?.webrtc_offer) return;

    // Only process if we haven't already created a PC for this offer
    if (pcRef.current || isBuyerRef.current) return;

    isBuyerRef.current = true;
    setupBuyerSide();
  }, [room?.webrtc_offer, id]);

  const setupBuyerSide = async () => {
    if (!id || !room?.webrtc_offer) return;

    try {
      const pc = createPeerConnection();
      pcRef.current = pc;
      // Dev diagnostics: surface connection state for the live-room debug panel
      (window as any).__escrowPc = pc;

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log('Buyer: Received remote stream');
        const remoteStream = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendIceCandidate(event.candidate, 'buyer');
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Buyer connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setIsStreaming(true);
        } else if (pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          setIsStreaming(false);
        }
      };

      // Set remote description (seller's offer)
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: room.webrtc_offer }));

      // Start polling for ICE candidates from seller
      startIcePolling();

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') resolve();
          };
          setTimeout(resolve, 3000);
        }
      });

      // Post answer to signaling server
      await videoApi.webrtcAnswer(id, pc.localDescription!.sdp!);

      isBuyerRef.current = true;
    } catch (err: any) {
      console.error('Buyer setup failed:', err);
      isBuyerRef.current = false;
    }
  };

  const startIcePolling = () => {
    stopPolling();
    // Both sides poll: apply candidates relayed by the OTHER side only.
    // Re-adding the same candidate every tick can restart ICE negotiation, so
    // each candidate is applied once, tracked by its content signature.
    const myRole = isSellerRef.current ? 'seller' : 'buyer';
    icePollRef.current = window.setInterval(async () => {
      if (!id || !pcRef.current) return;
      try {
        const res = await videoApi.getWebrtcIceCandidates(id);
        const raw = res?.candidates;
        const candidates: any[] = Array.isArray(raw) ? raw : raw ? JSON.parse(raw) : [];
        for (const item of candidates) {
          if (item.sender && item.sender !== myRole) {
            const signature = JSON.stringify(item.candidate);
            if (appliedCandidatesRef.current.has(signature)) continue;
            appliedCandidatesRef.current.add(signature);
            try {
              const cand = new RTCIceCandidate(item.candidate);
              await pcRef.current.addIceCandidate(cand);
            } catch {}
          }
        }
      } catch {
        // Transient error
      }
    }, ICE_POLL_MS);
  };

  // ---------- Shared polling for room updates ----------

  useEffect(() => {
    if (!id) return;
    // Watchers poll for room state to detect when the sharer stops sharing
    const poll = window.setInterval(async () => {
      if (!id) return;
      try {
        const info = await videoApi.getRoom(id);
        setRoom(info.room_state);
        // If sharing stopped remotely, clean up WebRTC. Never trigger for the
        // local sharer: a stale poll response right after starting would kill
        // their own stream.
        if (!info.room_state?.is_screen_sharing && isStreaming && !isLocalSharer) {
          setIsStreaming(false);
        }
      } catch {
        // Ignore
      }
    }, SIGNAL_POLL_MS);
    return () => window.clearInterval(poll);
  }, [id, isStreaming, isLocalSharer]);

  const stopPolling = () => {
    if (signalPollRef.current) {
      window.clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }
    if (icePollRef.current) {
      window.clearInterval(icePollRef.current);
      icePollRef.current = null;
    }
  };

  // ---------- Stop streaming ----------

  const stopStreaming = async () => {
    const wasLocalSharer = isSellerRef.current;

    // Stop peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    // Clear video sources
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    isSellerRef.current = false;
    isBuyerRef.current = false;
    pendingCandidatesRef.current = [];
    iceCandidatesRef.current = [];
    appliedCandidatesRef.current.clear();
    setIsLocalSharer(false);

    stopPolling();

    // Notify the room only if we were the one sharing (a watcher leaving must
    // not reset the room's sharing state).
    if (id && wasLocalSharer) {
      try {
        await videoApi.screenShare(id, false, 'Screen sharing ended');
      } catch {}
      setRoom((r) => (r ? { ...r, is_screen_sharing: false, stream_frame: null } : r));
    }
    setIsStreaming(false);
  };

  const toggleScreenShare = () => {
    if (isStreaming) {
      stopStreaming();
    } else {
      startScreenShare();
    }
  };

  // ---------- Capture frame for AI analysis ----------

  const captureFrame = async (): Promise<string | null> => {
    // Try to capture from local stream first (seller's view)
    if (localStreamRef.current && localStreamRef.current.getVideoTracks()[0]) {
      const video = document.createElement('video');
      video.srcObject = localStreamRef.current;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      await video.play().catch(() => {});
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        video.srcObject = null;
        video.load();
        return canvas.toDataURL('image/jpeg', 0.7);
      }
    }
    // Fallback: try from remote video (buyer's view)
    if (remoteVideoRef.current && remoteVideoRef.current.videoWidth) {
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = remoteVideoRef.current.videoWidth;
      canvas.height = remoteVideoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(remoteVideoRef.current, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.7);
      }
    }
    return null;
  };

  // ---------- AI checks ----------

  const analyzeScreenshot = async () => {
    if (!id) return;
    setIsAnalyzing(true);
    try {
      const frame = await captureFrame();
      await aiApi.analyze(id, frame || 'screen-capture');
      const res = await aiApi.getChecks(id);
      setAiChecks(res.checks || []);
    } catch (err: any) {
      alert('Analysis failed: ' + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ---------- Escrow ----------

  const ensureWallet = async (): Promise<string> => {
    const provider = getPhantom();
    if (!provider) {
      throw new Error('Phantom wallet not found. Install Phantom from https://phantom.app to deposit real SOL.');
    }
    if (user?.wallet_address) {
      return user.wallet_address;
    }
    const pubkey = await connectWallet();
    setWalletPubkey(pubkey);
    return pubkey;
  };

  const handleDeposit = async () => {
    if (!id || !deal) return;
    setIsDepositing(true);
    try {
      if (!chainConfig) throw new Error('Escrow chain config unavailable. Is the backend running?');
      const from = await ensureWallet();
      if (user?.wallet_address && from !== user.wallet_address) {
        throw new Error(`Deposit must come from your registered wallet (${shortAddress(user.wallet_address)}). Connected wallet is ${shortAddress(from)}.`);
      }
      const sig = await sendDepositTransaction(chainConfig, from, deal.amount || 0);
      const res = await escrowApi.deposit(id, deal.amount || 0, 'SOL', sig);
      setEscrowId(res?.id || null);
      setDepositSig(sig);
      await loadDeal(id);
    } catch (err: any) {
      alert('Deposit failed: ' + err.message);
    } finally {
      setIsDepositing(false);
    }
  };

  const handleReleaseEscrow = async () => {
    if (!escrowId) {
      alert('Deposit escrow first. There is nothing to release yet.');
      return;
    }
    setIsReleasing(true);
    try {
      const res = await escrowApi.release(escrowId);
      setPayout({
        state: 'released',
        sig: res?.solana_tx_signature || '',
        explorer: explorerTxUrl(chainConfig?.cluster || 'devnet', res?.solana_tx_signature || ''),
      });
      if (id) await loadDeal(id);
    } catch (err: any) {
      alert('Release failed: ' + err.message);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleRefundEscrow = async () => {
    if (!escrowId) {
      alert('Deposit escrow first. There is nothing to refund yet.');
      return;
    }
    setIsReleasing(true);
    try {
      const res = await escrowApi.refund(escrowId);
      setPayout({
        state: 'refunded',
        sig: res?.solana_tx_signature || '',
        explorer: explorerTxUrl(chainConfig?.cluster || 'devnet', res?.solana_tx_signature || ''),
      });
      if (id) await loadDeal(id);
    } catch (err: any) {
      alert('Refund failed: ' + err.message);
    } finally {
      setIsReleasing(false);
    }
  };

  // ---------- Observers ----------

  const handleInviteObserver = async () => {
    if (!id || !inviteEmail.trim()) return;
    try {
      await dealsApi.inviteObserver(id, inviteEmail.trim());
      setInviteResult(`Observer ${inviteEmail} invited successfully!`);
      setInviteEmail('');
      loadDeal(id);
    } catch (err: any) {
      setInviteResult(`Failed to invite observer: ${err.message}`);
    }
  };

  const copyInviteLink = async () => {
    if (!deal?.invitation_code) return;
    const link = `${window.location.origin}/deals/${id}/join?code=${encodeURIComponent(deal.invitation_code)}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  // ---------- Derived state ----------

  // The backend resolves the viewer's relationship to the deal (buyer, seller,
  // or a participant who joined with the invitation code).
  const role: 'buyer' | 'seller' | 'participant' | null =
    deal ? ((deal as any).viewer_role as 'buyer' | 'seller' | 'participant' | undefined) ?? null : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-apple-sky"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlassNavbar user={user} onLogout={() => navigate('/login')} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Breadcrumbs items={[
          { name: 'Home', path: '/' },
          { name: 'Dashboard', path: '/dashboard' },
          { name: 'Live Deal Room', path: id ? `/deals/${id}/live` : '/' },
        ]} />
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Live Deal Room</h1>
            <p className="text-apple-muted text-xs sm:text-sm font-mono mt-1 truncate">{id}</p>
          </div>
          <GlassButton variant="secondary" onClick={() => navigate('/dashboard')}>
            Exit
          </GlassButton>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-apple-danger/10 border border-apple-danger/30 text-apple-danger text-sm">
            {error}
          </div>
        )}

        {/* Role banner */}
        {deal && (
          <GlassCard className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                {role === 'buyer' && (
                  <GlassBadge variant="info" className="!bg-apple-sky/20 !text-apple-sky !border-apple-sky/30 !text-sm !px-4 !py-2">
                    ðŸ›’ You are the Buyer. You deposit and release the escrow.
                  </GlassBadge>
                )}
                {role === 'seller' && (
                  <GlassBadge variant="success" className="!bg-apple-success/20 !text-apple-success !border-apple-success/30 !text-sm !px-4 !py-2">
                    ðŸ’¼ You are the Seller. Share your screen while you work.
                  </GlassBadge>
                )}
                {role === 'participant' && <GlassBadge className="!text-sm !px-4 !py-2">You joined this deal with an invitation code</GlassBadge>}
              </div>
              <div className="flex flex-wrap gap-4 sm:gap-6 text-sm">
                <div>
                  <p className="text-apple-muted text-xs mb-0.5">Buyer</p>
                  <p className="text-white font-medium">
                    {deal.buyer_email || <span className="text-apple-muted">Unknown</span>}
                    {role === 'buyer' && <span className="text-apple-sky ml-2">(you)</span>}
                  </p>
                </div>
                <div>
                  <p className="text-apple-muted text-xs mb-0.5">Seller</p>
                  <p className="text-white font-medium">
                    {deal.seller_email || <span className="text-apple-muted">Unknown</span>}
                    {role === 'seller' && <span className="text-apple-success ml-2">(you)</span>}
                  </p>
                </div>
                {deal.amount ? (
                  <div>
                    <p className="text-apple-muted text-xs mb-0.5">Amount</p>
                    <p className="text-white font-medium">{deal.amount} {deal.currency || 'SOL'}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-apple-muted text-xs mb-0.5">Deal Status</p>
                  <p className="text-white font-medium capitalize">{deal.status}</p>
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main video area */}
          <div className="lg:col-span-3">
            <GlassCard className="relative overflow-hidden aspect-video bg-black/50">
              {/* Whoever is capturing sees their own preview; everyone else sees the remote stream.
                  Watchers render the video box as soon as sharing starts (not only once the peer
                  connection reports "connected"), so frames appear the instant they arrive. */}
              {isStreaming && isLocalSharer ? (
                // Seller's self-preview, bound to the locally captured stream
                <div className="absolute inset-0 flex flex-col">
                  <div className="flex items-center gap-2 px-3 py-2 bg-black/40">
                    <span className="w-2 h-2 rounded-full bg-apple-sky animate-pulse"></span>
                    <span className="text-white text-xs sm:text-sm">PREVIEW: You are sharing your screen</span>
                    <span className="text-apple-muted text-xs ml-auto hidden sm:inline">Live WebRTC stream</span>
                  </div>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain bg-black"
                  />
                </div>
              ) : room?.is_screen_sharing && !isLocalSharer ? (
                // Buyer sees seller's stream
                <div className="absolute inset-0 flex flex-col">
                  <div className="flex items-center gap-2 px-3 py-2 bg-black/40">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-white text-xs sm:text-sm">
                      LIVE: {room?.sharer_email || 'Seller'} is sharing their screen
                    </span>
                    <span className="text-apple-muted text-xs ml-auto hidden sm:inline">{room?.current_step}</span>
                  </div>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                </div>
              ) : (
                // No stream yet
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-apple-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-white font-medium">Waiting for the seller to share their screen…</p>
                  <p className="text-apple-muted text-xs sm:text-sm mt-2">
                    The seller starts screen sharing from this room. You will see it live here via WebRTC.
                  </p>
                </div>
              )}

              <div className="absolute bottom-3 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 sm:space-x-3">
                {/* Only the seller can share their screen; the buyer watches */}
                {role === 'seller' && (
                  <GlassButton
                    variant={isStreaming ? 'secondary' : 'primary'}
                    onClick={toggleScreenShare}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm"
                  >
                    {isStreaming ? 'Stop Sharing' : 'Share My Screen'}
                  </GlassButton>
                )}
                <GlassButton
                  variant="secondary"
                  onClick={analyzeScreenshot}
                  loading={isAnalyzing}
                  className="px-3 sm:px-4 py-2 text-xs sm:text-sm"
                >
                  Capture &amp; Analyze
                </GlassButton>
              </div>
            </GlassCard>
            {shareError && (
              <p className="text-apple-danger text-xs mt-2">{shareError}</p>
            )}
            {chainConfig && (
              <p className="text-apple-muted text-xs mt-3 leading-relaxed">
                Real escrow on <span className="text-white">{chainConfig.cluster}</span>: deposits go to escrow authority{' '}
                <span className="font-mono text-apple-sky">{shortAddress(chainConfig.escrow_authority)}</span>
                {chainConfig.cluster === 'devnet' && (
                  <>
                    {' '}(fund it on devnet:{' '}
                    <span className="font-mono text-white break-all">{chainConfig.escrow_authority}</span>) so payouts can be sent
                  </>
                )}
              </p>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <GlassCard>
              <h3 className="text-sm font-semibold text-apple-muted uppercase tracking-wider mb-4">Escrow (Real SOL)</h3>
              <div className="space-y-3">
                {role === 'buyer' && deal?.status === 'created' && (
                  <GlassButton onClick={handleDeposit} loading={isDepositing} className="w-full">
                    Deposit {deal.amount} SOL via Phantom
                  </GlassButton>
                )}
                {role === 'buyer' && deal?.status === 'funded' && !payout && (
                  <>
                    <GlassButton variant="secondary" onClick={handleReleaseEscrow} loading={isReleasing} className="w-full">
                      Release to Seller
                    </GlassButton>
                    <GlassButton
                      variant="secondary"
                      onClick={handleRefundEscrow}
                      loading={isReleasing}
                      className="w-full border-apple-danger/30 text-apple-danger hover:bg-apple-danger/10"
                    >
                      Refund to Buyer
                    </GlassButton>
                  </>
                )}
                {deal?.status === 'completed' && (
                  <div className="p-3 bg-apple-success/10 border border-apple-success/30 rounded-xl text-center">
                    <GlassBadge variant="success">Deal Completed</GlassBadge>
                  </div>
                )}
                {deal?.status === 'refunded' && (
                  <div className="p-3 bg-apple-warning/10 border border-apple-warning/30 rounded-xl text-center">
                    <GlassBadge variant="warning">Escrow Refunded</GlassBadge>
                  </div>
                )}
                {depositSig && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <p className="text-apple-muted mb-1">Deposit signature</p>
                    <a
                      className="text-apple-sky hover:text-white break-all font-mono"
                      href={explorerTxUrl(chainConfig?.cluster || 'devnet', depositSig)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {depositSig.slice(0, 24)}… →
                    </a>
                  </div>
                )}
                {payout && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <p className="text-apple-muted mb-1">Payout {payout.state}. On-chain signature:</p>
                    {payout.explorer ? (
                      <a className="text-apple-sky hover:text-white break-all font-mono" href={payout.explorer} target="_blank" rel="noreferrer">
                        {payout.sig.slice(0, 24)}… →
                      </a>
                    ) : (
                      <span className="font-mono break-all">{payout.sig}</span>
                    )}
                  </div>
                )}
                {role && deal?.status !== 'created' && deal?.status !== 'funded' && !payout && (
                  <p className="text-apple-muted text-xs leading-relaxed">
                    Escrow is settled. Status: <span className="text-white capitalize">{deal?.status}</span>
                  </p>
                )}
              </div>
            </GlassCard>

            {role && deal?.invitation_code && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-apple-muted uppercase tracking-wider mb-3">Share Deal Access</h3>
                <div className="p-3 rounded-xl border border-dashed border-apple-sky/40 bg-apple-sky/5 mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-apple-muted mb-1.5">Invitation Code</p>
                  <p className="text-white font-mono text-xs break-all leading-relaxed select-all">{deal.invitation_code}</p>
                </div>
                <GlassButton variant="secondary" onClick={copyInviteLink} className="w-full">
                  {linkCopied ? 'Link Copied. One-Click Join' : 'Copy One-Click Invite Link'}
                </GlassButton>
                <p className="text-apple-muted text-xs mt-3 leading-relaxed">
                  Anyone opening this link joins automatically. Without the code, the deal stays locked.
                </p>
              </GlassCard>
            )}

            {role && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-apple-muted uppercase tracking-wider mb-3">Invite Observer</h3>
                <div className="space-y-3">
                  <GlassInput
                    value={inviteEmail}
                    onChange={setInviteEmail}
                    placeholder="observer@email.com"
                    type="email"
                  />
                  <GlassButton onClick={handleInviteObserver} className="w-full">
                    Invite Observer
                  </GlassButton>
                  {inviteResult && (
                    <p className={`text-xs leading-relaxed ${inviteResult.startsWith('Failed') ? 'text-apple-danger' : 'text-apple-success'}`}>
                      {inviteResult}
                    </p>
                  )}
                </div>
              </GlassCard>
            )}

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
      <SiteFooter />

      <canvas ref={canvasRef} width="1280" height="720" className="hidden" />
    </div>
  );
}
