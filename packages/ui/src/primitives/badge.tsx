import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-fg-muted',
  primary: 'bg-primary-soft text-primary-fg',
  success: 'bg-success-soft text-success-fg',
  warning: 'bg-warning-soft text-warning-fg',
  danger: 'bg-danger-soft text-danger-fg',
  info: 'bg-info-soft text-info-fg',
};

interface BadgeProps {
  tone?: Tone;
  /** Icône Lucide de 12 px, décorative : l'état est toujours écrit en toutes lettres. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Pastille d'état. La couleur double le texte, elle ne le remplace jamais. */
export function Badge({ tone = 'neutral', icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'rounded-pill inline-flex h-6 items-center gap-1 px-2 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const dotTones: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  primary: 'bg-primary-fg',
  success: 'bg-success-fg',
  warning: 'bg-warning-fg',
  danger: 'bg-danger-fg',
  info: 'bg-info-fg',
};

/** Point d'état, toujours accompagné d'un libellé. */
export function StatusDot({ tone = 'neutral', className }: { tone?: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('rounded-pill inline-block size-2 shrink-0', dotTones[tone], className)}
    />
  );
}
