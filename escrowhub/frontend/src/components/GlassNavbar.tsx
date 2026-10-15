interface GlassNavbarProps {
  user?: { email: string; wallet_address: string | null } | null;
  onLogout: () => void;
}

export function GlassNavbar({ user, onLogout }: GlassNavbarProps) {
  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-apple-sky flex items-center justify-center shadow-sky">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight">EscrowHub</span>
          <span className="glass-badge text-xs">Beta</span>
        </div>

        <div className="flex items-center space-x-4">
          {user?.wallet_address && (
            <div className="hidden sm:flex items-center space-x-2 glass-badge">
              <div className="w-2 h-2 rounded-full bg-apple-success animate-pulse"></div>
              <span className="font-mono text-xs">{user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}</span>
            </div>
          )}
          <span className="text-apple-muted text-sm">{user?.email}</span>
          <button
            onClick={onLogout}
            className="glass-btn-secondary text-sm px-4 py-2"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}