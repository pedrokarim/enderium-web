/**
 * Pseudo actuel d'un lot d'UUID. `core_players` est la table de référence du pseudo : les
 * journaux n'y gardent que l'UUID, et c'est ici qu'on le rend lisible.
 */
import { chunk, type DbContext } from '../internal/context';
import { looksLikeUuid } from '../internal/input';

const NAME_LOOKUP_CHUNK = 500;

/** Rend `uuid → pseudo` pour les UUID connus. Les valeurs qui ne sont pas des UUID sont ignorées. */
export async function lookupPlayerNames(
  ctx: DbContext,
  uuids: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const wanted = [
    ...new Set([...uuids].filter((uuid): uuid is string => !!uuid && looksLikeUuid(uuid))),
  ];
  if (wanted.length === 0 || !(await ctx.catalog.has('core_players'))) return names;

  for (const batch of chunk(wanted, NAME_LOOKUP_CHUNK)) {
    const rows = await ctx.db
      .selectFrom('core_players')
      .select(['player_uuid', 'name'])
      .where('player_uuid', 'in', batch)
      .execute();
    for (const row of rows) names.set(row.player_uuid, row.name);
  }
  return names;
}
