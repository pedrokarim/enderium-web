'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/cn';

export interface TabLink {
  href: string;
  label: string;
  /** Compteur affiché après le libellé. */
  count?: number;
}

/**
 * Onglets d'une fiche, portés par des liens : chaque onglet a son adresse, se
 * partage et se recharge. L'onglet courant est celui dont l'adresse est exacte.
 */
export function TabLinks({ tabs, label }: { tabs: TabLink[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="border-border overflow-x-auto border-b">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap',
                  active
                    ? 'border-primary-fg text-fg font-medium'
                    : 'text-fg-muted hover:text-fg border-transparent',
                )}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span className="tabular rounded-pill bg-surface-sunken text-fg-muted px-2 text-xs leading-5">
                    {tab.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
