/** Ce que partagent tous les dépôts d'une même base ouverte. */
import type { Kysely } from 'kysely';

import type { Engine } from '../dialects';
import type { TableCatalog } from '../meta/tables';
import type { Database } from '../schema';

export interface DbContext {
  readonly engine: Engine;
  /** Connexion de lecture. Aucun dépôt n'écrit par elle. */
  readonly db: Kysely<Database>;
  readonly catalog: TableCatalog;
  /** L'heure courante en millisecondes (remplaçable dans les essais). */
  readonly now: () => number;
  /** Connexion d'écriture, réservée au dépôt des intentions. */
  withWriter<T>(work: (db: Kysely<Database>) => Promise<T>): Promise<T>;
  /** Le secret du lien, s'il est configuré. */
  linkSecret(): string | undefined;
}

/** Découpe une liste en paquets : une clause `IN` reste sous la limite de paramètres des moteurs. */
export function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}
