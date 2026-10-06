import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-field font-medium whitespace-nowrap ' +
  'transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-coarse:min-h-11';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-fg-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-sunken',
  ghost: 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
  danger: 'bg-danger text-fg-on-primary hover:bg-danger-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 text-[13px]',
  md: 'h-9 text-sm',
  lg: 'h-11 text-sm',
};

// Le remplissage dépend de la forme : un bouton d'icône est un carré sans marge,
// sinon son icône n'aurait plus la place de ses 16 px.
const paddings: Record<ButtonSize, { text: string; icon: string }> = {
  sm: { text: 'px-3', icon: 'w-8' },
  md: { text: 'px-4', icon: 'w-9' },
  lg: { text: 'px-5', icon: 'w-11' },
};

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
}

/**
 * Classes d'un bouton, pour habiller un lien (`<Link className={buttonClass()}>`)
 * sans dupliquer le style.
 */
export function buttonClass(options: ButtonClassOptions = {}): string {
  const { variant = 'secondary', size = 'md', iconOnly = false, className } = options;
  return cn(
    base,
    variants[variant],
    sizes[size],
    iconOnly ? paddings[size].icon : paddings[size].text,
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Bouton carré portant une seule icône : `aria-label` obligatoire. */
  iconOnly?: boolean;
  children: ReactNode;
}

export function Button({
  variant,
  size,
  iconOnly,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, iconOnly, className })} {...rest}>
      {children}
    </button>
  );
}
