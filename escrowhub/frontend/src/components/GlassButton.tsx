import React from 'react';

interface GlassButtonProps {
  variant?: 'primary' | 'secondary';
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function GlassButton({ variant = 'primary', onClick, disabled, type = 'button', loading, className = '', children }: GlassButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`glass-btn-${isPrimary ? 'primary' : 'secondary'} transition-all duration-200 ${
        disabled || loading ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}
