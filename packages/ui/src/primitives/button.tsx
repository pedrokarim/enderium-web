import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * `primary` valide (vert), `secondary` est le bouton neutre, `danger` retire
 * ou détruit, `ghost` reste à plat dans un panneau, `chrome` reste à plat sur
 * le châssis sombre (barre du haut, barre latérale).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'chrome';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'font-pixel inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap ' +
  'select-none disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-coarse:min-h-11';

/** Un bouton en relief : contour, biseau, et un cran d'enfoncement au clic. */
const raised = 'border-line bevel border-2 hover:brightness-105 active:translate-y-px';

const variants: Record<ButtonVariant, string> = {
  primary: cn(raised, 'bg-primary text-fg-on-primary bevel-primary'),
  secondary: cn(raised, 'bg-neutral text-fg-on-neutral bevel-neutral'),
  danger: cn(raised, 'bg-danger text-fg-on-danger bevel-danger'),
  ghost: 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
  chrome: 'on-chrome text-chrome-fg-muted hover:bg-nav hover:text-chrome-fg',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 text-sm',
  md: 'h-9 text-[15px]',
  lg: 'h-11 text-base',
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
