'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { LogoMark } from '../brand/logo';
import { buttonClass } from '../primitives/button';
import { cn } from '../lib/cn';

export interface NavItem {
  href: string;
  label: string;
  /** Icône Lucide de 16 px. */
  icon: ReactNode;
  /** Actif seulement sur l'adresse exacte (la page d'accueil de la console). */
  exact?: boolean;
}

export interface NavSection {
  /** Titre du groupe ; absent, le groupe n'a pas d'en-tête. */
  label?: string;
  items: NavItem[];
}

interface ConsoleShellProps {
  brand: { name: string; tagline: string; href: string };
  sections: NavSection[];
  /** Bas de la barre latérale : le compte connecté. */
  sidebarFooter?: ReactNode;
  /** Droite de la barre du haut : état du serveur, thème. */
  topbar?: ReactNode;
  labels: {
    navigation: string;
    openMenu: string;
    closeMenu: string;
    skipToContent: string;
  };
  children: ReactNode;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/**
 * Coquille de la console. La barre latérale touche le bord gauche et la zone
 * principale prend tout le reste : aucune largeur maximale sur la coquille.
 * Sous 1024 px, la barre devient un tiroir.
 */
export function ConsoleShell({
  brand,
  sections,
  sidebarFooter,
  topbar,
  labels,
  children,
}: ConsoleShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="bg-chrome flex min-h-dvh">
      <a
        href="#main"
        className="focus:border-line focus:bg-surface focus:text-fg sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border-2 focus:px-4 focus:py-2 focus:text-sm"
      >
        {labels.skipToContent}
      </a>

      {drawerOpen ? (
        <div
          aria-hidden
          className="bg-chrome-raised/80 fixed inset-0 z-30 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'on-chrome bg-chrome-raised fixed inset-y-0 left-0 z-40 flex w-62 flex-col',
          'transition-transform lg:sticky lg:top-0 lg:h-dvh lg:shrink-0 lg:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <Link href={brand.href} className="flex min-w-0 items-center gap-3">
            <LogoMark size={28} />
            <span className="flex min-w-0 flex-col">
              <span className="font-pixel text-chrome-fg truncate text-base leading-4 font-medium">
                {brand.name}
              </span>
              <span className="text-chrome-fg-muted truncate text-xs leading-4">
                {brand.tagline}
              </span>
            </span>
          </Link>
          <button
            type="button"
            aria-label={labels.closeMenu}
            onClick={() => setDrawerOpen(false)}
            className={buttonClass({
              variant: 'chrome',
              size: 'sm',
              iconOnly: true,
              className: 'lg:hidden',
            })}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <nav aria-label={labels.navigation} className="flex-1 overflow-y-auto px-3 py-2">
          <div className="flex flex-col gap-6">
            {sections.map((section, index) => (
              <div key={section.label ?? index} className="flex flex-col gap-1">
                {section.label ? (
                  <p className="text-chrome-fg-muted px-1 pb-1 text-xs font-medium">
                    {section.label}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setDrawerOpen(false)}
                          className={cn(
                            'border-line bevel font-pixel flex h-9 items-center gap-3 border-2 px-3 text-[15px] pointer-coarse:h-11',
                            active
                              ? 'bg-accent text-fg-on-accent bevel-accent font-medium'
                              : 'bg-nav text-fg-on-nav bevel-nav hover:brightness-110',
                          )}
                        >
                          <span className="shrink-0">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {sidebarFooter ? <div className="shrink-0 p-3">{sidebarFooter}</div> : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="on-chrome bg-chrome sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 px-4">
          <button
            type="button"
            aria-label={labels.openMenu}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className={buttonClass({ variant: 'chrome', iconOnly: true, className: 'lg:hidden' })}
          >
            <Menu size={16} aria-hidden />
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-2">{topbar}</div>
        </div>
        {/* Le contenu vit dans un grand panneau biseauté, posé sur le châssis. */}
        <main
          id="main"
          className="border-line bg-bg bevel mx-2 mb-2 min-w-0 flex-1 border-2 p-4 lg:mr-4 lg:mb-4 lg:ml-0 lg:p-6"
        >
          <div className="max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
