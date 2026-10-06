import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';

export interface Crumb {
  label: string;
  /** Absent sur le dernier élément : c'est la page courante. */
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Fil d'Ariane, du plus général au plus précis. */
  crumbs?: Crumb[];
  crumbsLabel?: string;
  /** Élément placé devant le titre (vignette d'un joueur, par exemple). */
  leading?: ReactNode;
  /** Pastilles d'état placées à côté du titre. */
  meta?: ReactNode;
  /** Actions de la page, alignées à droite. */
  actions?: ReactNode;
}

/** En-tête d'une page de la console : fil d'Ariane, titre, description, actions. */
export function PageHeader({
  title,
  description,
  crumbs,
  crumbsLabel,
  leading,
  meta,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label={crumbsLabel}>
          <ol className="text-fg-muted flex flex-wrap items-center gap-1 text-[13px]">
            {crumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1">
                {index > 0 ? (
                  <ChevronRight size={14} aria-hidden className="text-fg-subtle" />
                ) : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-fg hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-fg">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          {leading}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-pixel text-fg text-2xl leading-8 font-medium">{title}</h1>
              {meta}
            </div>
            {description ? (
              <p className="text-fg-muted max-w-[72ch] text-sm">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/** Empile les blocs d'une page avec l'espacement de la console. */
export function PageStack({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col gap-6', className)}>{children}</div>;
}

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Précision sous la valeur (période, source). */
  hint?: ReactNode;
  icon?: ReactNode;
}

/**
 * Un chiffre clé, sur une carte en aplat comme celles des menus du jeu. La
 * teinte vient de la place de la carte dans sa grille (`StatGrid`) : elle
 * distingue les cartes entre elles, elle ne dit rien de la valeur.
 */
export function StatTile({ label, value, hint, icon }: StatTileProps) {
  return (
    <div className="stat-tile border-line bevel flex min-w-0 flex-col gap-2 border-2 p-4">
      <div className="font-pixel flex items-center justify-between gap-2 text-[15px] leading-5">
        <span className="truncate">{label}</span>
        {icon ? <span className="shrink-0">{icon}</span> : null}
      </div>
      <div className="font-pixel tabular truncate text-[30px] leading-9 font-medium">{value}</div>
      {hint ? <div className="text-[13px]">{hint}</div> : null}
    </div>
  );
}

/** Grille de chiffres clés : 1, 2 ou 4 colonnes selon la place. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="stat-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

/** Ce qu'on montre quand une liste est vide : dire pourquoi, et quoi faire. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      {icon ? (
        <span className="border-line bg-bg text-fg-muted bevel flex size-10 items-center justify-center border-2">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="font-pixel text-fg text-base font-medium">{title}</p>
        {description ? (
          <p className="text-fg-muted max-w-[56ch] text-[13px]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

interface DescriptionItem {
  label: string;
  value: ReactNode;
}

/** Paires libellé / valeur, sur une ou deux colonnes. */
export function DescriptionList({
  items,
  columns = 1,
}: {
  items: DescriptionItem[];
  columns?: 1 | 2;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3 text-sm',
        columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-fg-muted text-[13px]">{item.label}</dt>
          <dd className="text-fg min-w-0 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
