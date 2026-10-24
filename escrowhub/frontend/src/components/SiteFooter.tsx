import React from 'react';
import { Link } from 'react-router-dom';

// Site-wide footer: internal linking for users and crawlers.
export function SiteFooter() {
  return (
    <footer className="glass-nav mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-green-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-sm font-semibold">EscrowHub</span>
            <span className="text-apple-muted text-xs">Escrow payments on Solana</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link to="/dashboard" className="text-apple-muted hover:text-white transition-colors">Dashboard</Link>
            <Link to="/deals/create" className="text-apple-muted hover:text-white transition-colors">Create a Deal</Link>
            <Link to="/join" className="text-apple-muted hover:text-white transition-colors">Join with Code</Link>
            <Link to="/analytics" className="text-apple-muted hover:text-white transition-colors">Analytics</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
