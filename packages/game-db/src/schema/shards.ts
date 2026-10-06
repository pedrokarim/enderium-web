/** Journal des Éclats (`shards_log`). Sens des colonnes : `enderium-core/docs/data/shards.md`. */
import type { Generated } from 'kysely';

export interface ShardsLogTable {
  id: Generated<number>;
  player_uuid: string;
  delta: number;
  balance_after: number;
  reason: string;
  created_at: number;
}

export interface ShardsTables {
  shards_log: ShardsLogTable;
}
