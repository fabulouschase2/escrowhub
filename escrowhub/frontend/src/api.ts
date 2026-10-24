const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    // An expired/revoked session should not leave the UI in a broken state:
    // clear local auth and send the user back to login (except on login itself).
    if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const authApi = {
  register: (email: string, password: string, walletAddress?: string, hcaptchaToken?: string) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, wallet_address: walletAddress, hcaptcha_token: hcaptchaToken }),
    }),

  login: (email: string, password: string, hcaptchaToken?: string) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, hcaptcha_token: hcaptchaToken }),
    }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  switchWorkspace: (workspaceId: string) =>
    request('/auth/switch_workspace', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId }),
    }),
};

export const workspaceApi = {
  list: () => request('/workspaces'),
  create: (name: string) =>
    request('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
};

export const dealsApi = {
  create: (sellerId: string, amount?: number, currency?: string, platformFeePct?: number) =>
    request('/deals', {
      method: 'POST',
      body: JSON.stringify({
        seller_id: sellerId,
        amount,
        currency,
        platform_fee_pct: platformFeePct,
      }),
    }),

  list: () => request('/deals'),

  get: (id: string) => request(`/deals/${id}`),

  join: (dealId: string, code: string) =>
    request(`/deals/${dealId}/join`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // Join with the invitation code alone: the backend resolves the deal id
  // (codes are unique per deal), so /join works without a deal in the URL.
  joinByCode: (code: string) =>
    request('/deals/join-by-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  inviteObserver: (dealId: string, observerEmail: string) =>
    request(`/deals/${dealId}/invite_observer`, {
      method: 'POST',
      body: JSON.stringify({ observer_email: observerEmail }),
    }),
};

export const escrowApi = {
  config: () => request('/escrow/config'),

  deposit: (dealId: string, amount: number, tokenMint: string, solanaTxSignature: string) =>
    request('/escrow/deposit', {
      method: 'POST',
      body: JSON.stringify({ deal_id: dealId, amount, token_mint: tokenMint, solana_tx_signature: solanaTxSignature }),
    }),

  release: (escrowId: string) =>
    request(`/escrow/release/${escrowId}`, { method: 'POST' }),

  refund: (escrowId: string) =>
    request(`/escrow/refund/${escrowId}`, { method: 'POST' }),
};

export const videoApi = {
  createRoom: (dealId: string) =>
    request('/video/room', {
      method: 'POST',
      body: JSON.stringify({ deal_id: dealId }),
    }),

  getRoom: (dealId: string) =>
    request(`/video/room/${dealId}`),

  screenShare: (dealId: string, isSharing: boolean, currentStep?: string, streamFrame?: string | null) =>
    request(`/video/room/${dealId}/screen_share`, {
      method: 'POST',
      body: JSON.stringify({
        deal_id: dealId,
        is_sharing: isSharing,
        current_step: currentStep,
        ...(streamFrame !== undefined ? { stream_frame: streamFrame } : {}),
      }),
    }),

  // WebRTC signaling
  webrtcOffer: (dealId: string, offer: string) =>
    request(`/video/room/${dealId}/webrtc/offer`, {
      method: 'POST',
      body: JSON.stringify({ deal_id: dealId, offer }),
    }),

  webrtcAnswer: (dealId: string, answer: string) =>
    request(`/video/room/${dealId}/webrtc/answer`, {
      method: 'POST',
      body: JSON.stringify({ deal_id: dealId, answer }),
    }),

  webrtcIceCandidate: (dealId: string, candidate: RTCIceCandidate, sender: 'seller' | 'buyer') =>
    request(`/video/room/${dealId}/webrtc/candidate`, {
      method: 'POST',
      body: JSON.stringify({ deal_id: dealId, candidate, sender }),
    }),

  getWebrtcIceCandidates: (dealId: string) =>
    request(`/video/room/${dealId}/webrtc/ice`),
};

export const aiApi = {
  analyze: (sessionId: string, screenshotUrl: string) =>
    request('/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, screenshot_url: screenshotUrl }),
    }),

  getChecks: (sessionId: string) =>
    request(`/ai/checks/${sessionId}`),
};

export const disputesApi = {
  create: (dealId: string, initiatorId: string, reason: string, evidenceUrls?: string[]) =>
    request('/disputes', {
      method: 'POST',
      body: JSON.stringify({ deal_id: dealId, initiator_id: initiatorId, reason, evidence_urls: evidenceUrls }),
    }),

  resolve: (disputeId: string, resolution: string) =>
    request(`/disputes/${disputeId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),

  get: (dealId: string) =>
    request(`/disputes/${dealId}`),
};

export const auditApi = {
  list: () => request('/audit'),
};

export const analyticsApi = {
  summary: () => request('/analytics/summary'),
};

export const healthApi = {
  check: () => request('/health'),
};
