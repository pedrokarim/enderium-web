import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonClass } from '../primitives/button';
import { cn } from '../lib/cn';

type Align = 'left' | 'right';

/**
 * Tableau de données. Le défilement horizontal reste dans le tableau : la page
 * ne déborde jamais, même sur un écran étroit.
 */
export function Table({
  caption,
  children,
  className,
}: {
  /** Décrit le tableau aux lecteurs d'écran ; invisible. */
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-border text-fg-muted border-b text-[13px]">
      <tr>{children}</tr>
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-border divide-y">{children}</tbody>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-surface-sunken/60', className)}>{children}</tr>;
}

interface CellProps {
  align?: Align;
  /** Chiffres alignés en colonne. */
  numeric?: boolean;
  className?: string;
  children?: ReactNode;
}

export function HeaderCell({ align = 'left', className, children }: CellProps) {
  return (
    <th
      scope="col"
      className={cn(
        'h-10 px-4 font-medium whitespace-nowrap',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Cell({ align = 'left', numeric, className, children }: CellProps) {
  return (
    <td
      className={cn(
        'text-fg h-12 px-4 py-2 align-middle',
        align === 'right' && 'text-right',
        numeric && 'tabular whitespace-nowrap',
        className,
      )}
    >
      {children}
    </td>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Adresse d'une page donnée (les filtres courants y sont conservés). */
  hrefFor: (page: number) => string;
  labels: {
    navigation: string;
    previous: string;
    next: string;
    /** « 1 – 25 sur 312 », par exemple. */
    summary: (from: number, to: number, total: number) => string;
  };
}

/** Pied de liste : la plage affichée, et les pages précédente et suivante. */
export function Pagination({ page, pageSize, total, hrefFor, labels }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav
      aria-label={labels.navigation}
      className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
    >
      <p className="tabular text-fg-muted text-[13px]">{labels.summary(from, to, total)}</p>
      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Link href={hrefFor(page - 1)} className={buttonClass({ size: 'sm' })}>
            <ChevronLeft size={16} aria-hidden />
            {labels.previous}
          </Link>
        ) : (
          <span aria-disabled className={buttonClass({ size: 'sm' })}>
            <ChevronLeft size={16} aria-hidden />
            {labels.previous}
          </span>
        )}
        {hasNext ? (
          <Link href={hrefFor(page + 1)} className={buttonClass({ size: 'sm' })}>
            {labels.next}
            <ChevronRight size={16} aria-hidden />
          </Link>
        ) : (
          <span aria-disabled className={buttonClass({ size: 'sm' })}>
            {labels.next}
            <ChevronRight size={16} aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
