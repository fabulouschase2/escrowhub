import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function GlassCard({ children, className = '', onClick }: GlassCardProps) {
  return (
    <div
      className={`glass-card p-6 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}