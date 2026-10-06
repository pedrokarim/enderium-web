import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-raised text-fg',
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

/** Étiquette d'état. La couleur double le texte, elle ne le remplace jamais. */
export function Badge({ tone = 'neutral', icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'border-line font-pixel inline-flex h-6 items-center gap-1 border-2 px-2 text-[13px] font-medium whitespace-nowrap',
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
  neutral: 'bg-neutral',
  primary: 'bg-primary',
  success: 'bg-primary',
  warning: 'bg-accent',
  danger: 'bg-danger',
  info: 'bg-info',
};

/** Pastille d'état carrée, cernée de noir, toujours accompagnée d'un libellé. */
export function StatusDot({ tone = 'neutral', className }: { tone?: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('border-line inline-block size-3 shrink-0 border-2', dotTones[tone], className)}
    />
  );
}
