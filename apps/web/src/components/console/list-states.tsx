import Link from 'next/link';
import { Badge, EmptyState, buttonClass } from '@enderium/ui';
import { formatDateTime } from '@/lib/format';

/**
 * Ce qu'on montre quand le numéro de page de l'adresse dépasse la fin d'une
 * liste qui n'est pourtant pas vide : dire que la page n'existe pas, plutôt
 * que « aucun résultat ».
 */
export function PageOutOfRange({ firstPageHref }: { firstPageHref: string }) {
  return (
    <EmptyState
      title="Cette page n’existe pas"
      description="La liste est plus courte que le numéro de page demandé."
      action={
        <Link href={firstPageHref} className={buttonClass({ size: 'sm' })}>
          Revenir à la première page
        </Link>
      }
    />
  );
}

/** Le détail d'une ligne de journal : un texte technique, long, qui doit se couper. */
export function LogDetail({ detail, reason }: { detail: string; reason?: string | null }) {
  return (
    <span className="flex max-w-96 min-w-48 flex-col gap-1">
      <span className="font-mono text-[13px] break-all">{detail}</span>
      {reason ? <span className="text-fg-muted text-xs break-words">Motif : {reason}</span> : null}
    </span>
  );
}

/** Une échéance : la date, « Sans fin », et une pastille quand elle est dépassée. */
export function Expiry({ expiresAt, expired }: { expiresAt: number | null; expired: boolean }) {
  if (expiresAt === null) return <span className="text-fg-muted">Sans fin</span>;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-fg-muted">{formatDateTime(expiresAt)}</span>
      {expired ? <Badge tone="warning">Échu</Badge> : null}
    </span>
  );
}
