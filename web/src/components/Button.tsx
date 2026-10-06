import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-violet text-ink hover:bg-violet-strong font-semibold disabled:opacity-50',
  ghost: 'bg-white/[0.07] text-fg hover:bg-white/[0.11] font-medium disabled:opacity-50',
  danger: 'bg-red/15 text-red hover:bg-red/25 font-medium disabled:opacity-50',
  link: 'bg-transparent text-violet-strong hover:underline font-medium px-0 py-0 disabled:opacity-50',
};
const SIZE: Record<Size, string> = { sm: 'text-[12px] px-2.5 py-1.5 rounded-md', md: 'text-[13px] px-3.5 py-2 rounded-lg' };

export function Button({
  variant = 'ghost',
  size = 'md',
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  const sizing = variant === 'link' ? '' : SIZE[size];
  return (
    <button type="button" className={`inline-flex items-center justify-center gap-1.5 transition-colors ${VARIANT[variant]} ${sizing} ${className}`} {...rest}>
      {children}
    </button>
  );
}
