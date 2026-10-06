'use client';

import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { Button, Notice, PageHeader, PageStack } from '@enderium/ui';

/**
 * Erreur d'une page de la console : presque toujours la base du jeu qui ne
 * répond pas. La coquille reste en place, on peut réessayer ou changer d'écran.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageStack>
      <PageHeader title="Cette page n’a pas pu s’afficher" />
      <Notice
        tone="danger"
        role="alert"
        title="La lecture de la base d’Enderium a échoué"
        action={
          <Button size="sm" onClick={reset}>
            <RotateCw size={16} aria-hidden />
            Réessayer
          </Button>
        }
      >
        Vérifiez que la base est joignable (ENDERIUM_DB_URL), puis réessayez. Le détail est dans le
        journal du serveur du site
        {error.digest ? (
          <>
            {' '}
            sous la référence <span className="font-mono">{error.digest}</span>
          </>
        ) : null}
        .
      </Notice>
    </PageStack>
  );
}
