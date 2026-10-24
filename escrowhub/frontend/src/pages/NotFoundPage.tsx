import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { setPageMeta } from '../seo';
import { GlassNavbar } from '../components/GlassNavbar';
import { SiteFooter } from '../components/SiteFooter';
import { useAuth } from '../auth';

// Custom 404: keep the user oriented instead of silently redirecting.
export function NotFoundPage() {
  const { user, logout } = useAuth();

  useEffect(() => {
    setPageMeta({
      title: 'Page Not Found | EscrowHub',
      description: 'The page you requested does not exist. Return to your EscrowHub dashboard, create a deal, or join one with an invitation code.',
      path: '/404',
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <GlassNavbar user={user} onLogout={logout} />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-md">
          <p className="text-6xl sm:text-7xl font-bold text-green-500 mb-4" aria-hidden="true">404</p>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">This page does not exist</h1>
          <p className="text-apple-muted text-sm mb-8">
            The link may be outdated or the deal may have been removed. Check the address or pick a destination below.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/dashboard" className="glass-btn-primary">Go to Dashboard</Link>
            <Link to="/deals/create" className="glass-btn-secondary">Create a Deal</Link>
            <Link to="/join" className="glass-btn-secondary">Join with a Code</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
