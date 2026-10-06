import type { InputHTMLAttributes, ReactNode } from 'react';

// Campo de texto com rótulo; o mesmo visual em toda parte.
export function Field({ label, hint, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label block mb-1.5">{label}</span>}
      <input
        className="w-full bg-surface border border-line rounded-lg px-3 py-2.5 text-[13px] text-fg placeholder:text-faint focus-visible:border-violet/60 disabled:opacity-50"
        {...rest}
      />
      {hint && <span className="block mt-1.5 text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export function Select({ label, className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label block mb-1.5">{label}</span>}
      <select className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-fg focus-visible:border-violet/60" {...rest}>
        {children}
      </select>
    </label>
  );
}
