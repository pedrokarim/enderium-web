'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@enderium/ui';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

const ONE_YEAR_SECONDS = 365 * 24 * 3600;

function currentTheme(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Bascule entre thème clair et sombre. Le choix est gardé dans un cookie pour
 * que le serveur rende directement le bon thème à la prochaine page.
 */
export function ThemeToggle() {
  const toggle = () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  };

  return (
    <Button variant="chrome" iconOnly aria-label="Changer de thème" onClick={toggle}>
      {/* Les deux icônes sont rendues ; le thème actif choisit laquelle se voit. */}
      <Sun size={16} aria-hidden className="hidden dark:block" />
      <Moon size={16} aria-hidden className="dark:hidden" />
    </Button>
  );
}
