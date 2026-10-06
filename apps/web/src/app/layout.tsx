import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Enderium', template: '%s · Enderium' },
  description: 'Le site d’Enderium.',
  // Fermé à l'indexation tant que le site n'a pas de pages publiques.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Le thème choisi est lu côté serveur : la page arrive déjà dans le bon
  // thème, sans éclair au chargement. Sans choix, le système décide (CSS).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="fr" data-theme={theme ?? undefined}>
      <body>{children}</body>
    </html>
  );
}
