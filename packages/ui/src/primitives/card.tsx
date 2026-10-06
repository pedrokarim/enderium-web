import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface CardProps {
  className?: string;
  children: ReactNode;
}

/** Un encart posé dans le panneau : contour noir franc, fond plus clair. */
export function Card({ className, children }: CardProps) {
  return (
    <section className={cn('border-line bg-surface min-w-0 border-2', className)}>
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

/** Le bandeau de titre d'un encart, de la teinte du panneau. */
export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <header
      className={cn(
        'border-line bg-bg flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-pixel text-fg truncate text-[17px] leading-6 font-medium">{title}</h2>
        {description ? <p className="text-fg-muted text-[13px]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ className, children }: CardProps) {
  return <div className={cn('p-4', className)}>{children}</div>;
}
