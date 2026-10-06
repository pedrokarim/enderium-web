/** Tables des entités (`entities_*`). Sens des colonnes : `enderium-core/docs/data/entities.md`. */

export interface EntitiesKillsTable {
  player_uuid: string;
  creature_id: string;
  kills: number;
}

export interface EntitiesBossClaimsTable {
  player_uuid: string;
  boss_id: string;
  /** Jour, heure de Paris, au format AAAA-MM-JJ. */
  claim_day: string;
  claims: number;
}

export interface EntitiesLootPityTable {
  player_uuid: string;
  loot_key: string;
  misses: number;
}

export interface EntitiesTables {
  entities_kills: EntitiesKillsTable;
  entities_boss_claims: EntitiesBossClaimsTable;
  entities_loot_pity: EntitiesLootPityTable;
}
