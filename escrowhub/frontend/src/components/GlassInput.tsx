interface GlassInputProps {
  label?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function GlassInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  className = '',
}: GlassInputProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-apple-muted mb-2">
          {label}
          {required && <span className="text-apple-sky ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="glass-input w-full"
      />
    </div>
  );
}