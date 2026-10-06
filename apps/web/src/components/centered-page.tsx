import type { ReactNode } from 'react';
import { LogoMark } from '@enderium/ui';

/**
 * Page de lecture hors de la console (connexion, refus, erreur) : une colonne
 * étroite et centrée, la marque au-dessus.
 */
export function CenteredPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="on-chrome bg-chrome flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <LogoMark size={48} title="Enderium" />
          <div className="flex flex-col gap-2">
            <h1 className="font-pixel text-chrome-fg text-2xl leading-8 font-medium">{title}</h1>
            {description ? <p className="text-chrome-fg-muted text-sm">{description}</p> : null}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
