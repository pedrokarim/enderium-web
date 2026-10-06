import Link from 'next/link';

/** Adresse de la fiche d'une zone : le monde et l'identifiant sont deux segments encodés. */
export function zoneHref(world: string, id: string): string {
  return `/console/regions/${encodeURIComponent(world)}/${encodeURIComponent(id)}`;
}

/** Lien vers la fiche d'une zone, avec son monde dessous si on le demande. */
export function ZoneLink({
  world,
  id,
  showWorld = false,
}: {
  world: string;
  id: string;
  showWorld?: boolean;
}) {
  return (
    <Link
      href={zoneHref(world, id)}
      className="group rounded-field inline-flex max-w-full flex-col"
    >
      <span className="text-fg font-medium break-all group-hover:underline">{id}</span>
      {showWorld ? <span className="text-fg-subtle text-xs break-all">{world}</span> : null}
    </Link>
  );
}
