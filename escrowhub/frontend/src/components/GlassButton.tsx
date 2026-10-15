interface GlassButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

export function GlassButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  loading,
  className = '',
  type = 'button',
}: GlassButtonProps) {
  const baseClass = variant === 'primary' ? 'glass-btn-primary' : 'glass-btn-secondary';
  const disabledClass = disabled || loading ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClass} ${disabledClass} ${className}`}
    >
      {loading ? (
        <span className="flex items-center space-x-2">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Processing...</span>
        </span>
      ) : children}
    </button>
  );
}