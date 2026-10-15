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
};

export const escrowApi = {
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

export const healthApi = {
  check: () => request('/health'),
};