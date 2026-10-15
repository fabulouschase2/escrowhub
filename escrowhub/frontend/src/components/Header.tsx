import React from 'react'
import { Link, useLocation, NavLink } from 'react-router-dom'
import { useAuth } from '../auth'

export function Header() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/deals/create', label: 'Create Deal', icon: <PlusIcon /> },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-bg-primary)]/80 backdrop-blur-xl border-b border-[var(--color-border-secondary)]">
      <nav className="apple-container" aria-label="Main navigation">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 text-decoration-none" aria-label="EscrowHub Home">
            <LogoIcon className="w-7 h-7 text-[var(--color-accent-blue)]" aria-hidden="true" />
            <span className="text-xl font-semibold text-[var(--color-text-primary)] tracking-tight">
              EscrowHub
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `
                  flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-120
                  ${isActive
                    ? 'bg-[var(--color-accent-blue)] text-white shadow-[var(--color-shadow-sm)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-secondary)]'
                  }
                `}
                aria-current={({ isActive }) => isActive ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Right side - User menu */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={() => document.documentElement.classList.toggle('dark')}
              className="p-2 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-secondary)] transition-colors duration-120"
              aria-label="Toggle dark mode"
            >
              <SunIcon className="w-5 h-5 hidden dark:block" aria-hidden="true" />
              <MoonIcon className="w-5 h-5 block dark:hidden" aria-hidden="true" />
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                id="user-menu-button"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[var(--color-border-secondary)] transition-colors duration-120"
                aria-expanded="false"
                aria-haspopup="true"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--color-accent-blue)] flex items-center justify-center text-white font-medium text-sm">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:block text-sm font-medium text-[var(--color-text-primary)]">
                  {user?.email}
                </span>
                <ChevronDownIcon className="w-4 h-4 text-[var(--color-text-secondary)]" aria-hidden="true" />
              </button>

              {/* Dropdown menu */}
              <div
                id="user-menu-dropdown"
                className="absolute right-0 mt-2 w-48 origin-top-right rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border-secondary)] shadow-[var(--color-shadow-lg)] opacity-0 invisible scale-95 transition-all duration-120"
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="user-menu-button"
              >
                <div className="px-3 py-2 border-b border-[var(--color-border-secondary)]">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">Account</p>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-accent-red)] hover:bg-[var(--color-border-secondary)] rounded-none focus:outline-none focus:bg-[var(--color-border-secondary)]"
                  role="menuitem"
                >
                  <LogoutIcon className="w-4 h-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-secondary)] transition-colors duration-120"
              aria-label="Open menu"
            >
              <MenuIcon className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>
    </header>
  )
}

// SVG Icons
function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default Header