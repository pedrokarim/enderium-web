import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface CardProps {
  className?: string;
  children: ReactNode;
}

/** Un panneau. Jamais de bande ni de bordure colorée : un filet neutre suffit. */
export function Card({ className, children }: CardProps) {
  return (
    <section className={cn('rounded-card border-border bg-surface min-w-0 border', className)}>
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: string;
  description?: ReactNode;
  /** Actions alignées à droite du titre. */
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <header
      className={cn(
        'border-border flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-fg truncate text-sm font-semibold">{title}</h2>
        {description ? <p className="text-fg-muted text-[13px]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ className, children }: CardProps) {
  return <div className={cn('p-4', className)}>{children}</div>;
}
