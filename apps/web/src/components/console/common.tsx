import Link from 'next/link';
import { PackageX } from 'lucide-react';
import { Avatar, Badge, EmptyState, Pagination } from '@enderium/ui';
import type { Page } from '@enderium/game-db';
import { formatNumber, shortUuid } from '@/lib/format';
import { SERVER_ACTOR_UUID } from '@/lib/labels';

/** Lien vers la fiche d'un joueur : vignette, pseudo, et l'UUID abrégé dessous. */
export function PlayerLink({
  uuid,
  name,
  showUuid = false,
}: {
  uuid: string;
  name: string | null;
  showUuid?: boolean;
}) {
  const label = name || shortUuid(uuid);
  return (
    <Link
      href={`/console/players/${uuid}`}
      className="group rounded-field inline-flex max-w-full items-center gap-3"
    >
      <Avatar name={label} size={showUuid ? 32 : 24} />
      <span className="flex min-w-0 flex-col">
        <span className="text-fg truncate font-medium group-hover:underline">{label}</span>
        {showUuid ? (
          <span className="text-fg-subtle truncate font-mono text-xs">{shortUuid(uuid)}</span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * L'auteur d'une ligne de journal : un joueur, le serveur lui-même (UUID nul),
 * ou une origine technique (`import`).
 */
export function Actor({ uuid, name }: { uuid: string | null; name: string | null }) {
  if (!uuid) return <span className="text-fg-muted">Serveur</span>;
  if (uuid === SERVER_ACTOR_UUID) return <span className="text-fg-muted">Serveur</span>;
  if (!uuid.includes('-')) return <span className="text-fg-muted">{uuid}</span>;
  return <PlayerLink uuid={uuid} name={name} />;
}

/**
 * Pastille d'un grade. Sa couleur est une donnée du jeu (celle du grade en
 * jeu) : elle est montrée par un point, le nom reste dans la couleur du texte.
 */
export function GroupChip({ id, color, href }: { id: string; color?: string; href?: boolean }) {
  const chip = (
    <Badge>
      {color && /^#[0-9a-f]{6}$/i.test(color) ? (
        <span
          aria-hidden
          className="border-line inline-block size-3 border"
          style={{ backgroundColor: color }}
        />
      ) : null}
      {id}
    </Badge>
  );
  if (!href) return chip;
  return (
    <Link href={`/console/permissions/${encodeURIComponent(id)}`} className="rounded-pill">
      {chip}
    </Link>
  );
}

/** Pied de liste paginée, libellés français compris. */
export function ListPagination<T>({
  page,
  hrefFor,
}: {
  page: Page<T>;
  hrefFor: (page: number) => string;
}) {
  if (page.total <= page.pageSize && page.page === 1) return null;
  return (
    <Pagination
      page={page.page}
      pageSize={page.pageSize}
      total={page.total}
      hrefFor={hrefFor}
      labels={{
        navigation: 'Pages de la liste',
        previous: 'Précédent',
        next: 'Suivant',
        summary: (from, to, total) =>
          `${formatNumber(from)} – ${formatNumber(to)} sur ${formatNumber(total)}`,
      }}
    />
  );
}

/** Ce qu'on montre à la place d'un écran dont le module n'est pas installé. */
export function ModuleMissing({ module, tables }: { module: string; tables: string }) {
  return (
    <EmptyState
      icon={<PackageX size={20} aria-hidden />}
      title={`Le module ${module} n’est pas installé`}
      description={
        <>
          La base ne contient pas ses tables (<span className="font-mono">{tables}</span>). Elles
          sont créées au premier démarrage du plugin sur le serveur.
        </>
      }
    />
  );
}
