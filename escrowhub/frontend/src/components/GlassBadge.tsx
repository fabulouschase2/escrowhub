import React from 'react';

interface GlassBadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  children: React.ReactNode;
}

export function GlassBadge({ variant = 'success', className = '', children }: GlassBadgeProps) {
  const variants: Record<string, string> = {
    success: 'glass-badge-success',
    warning: 'glass-badge-warning',
    danger: 'glass-badge-danger',
    info: 'glass-badge',
  };

  return (
    <span className={`glass-badge ${variants[variant] || 'glass-badge'} ${className}`}>
      {children}
    </span>
  );
}
