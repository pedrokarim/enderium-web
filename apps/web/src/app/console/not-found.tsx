import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Card, EmptyState, buttonClass } from '@enderium/ui';

export default function ConsoleNotFound() {
  return (
    <Card>
      <EmptyState
        icon={<SearchX size={20} aria-hidden />}
        title="Introuvable"
        description="Cette fiche n’existe pas ou n’existe plus dans la base du serveur."
        action={
          <Link href="/console" className={buttonClass({ size: 'sm' })}>
            Revenir à la vue d’ensemble
          </Link>
        }
      />
    </Card>
  );
}
