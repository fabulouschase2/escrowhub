interface GlassBadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function GlassBadge({ children, variant = 'default', className = '' }: GlassBadgeProps) {
  const variants = {
    default: 'glass-badge',
    success: 'glass-badge-success',
    warning: 'glass-badge-warning',
    danger: 'glass-badge-danger',
    info: 'glass-badge bg-apple-sky/20 text-apple-sky border border-apple-sky/30',
  };

  return (
    <span className={`${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}