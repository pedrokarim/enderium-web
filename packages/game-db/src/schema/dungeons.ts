/** Tables des donjons (`dungeons_*`). Sens des colonnes : `enderium-core/docs/data/dungeons.md`. */

export interface DungeonsRunsTable {
  run_id: string;
  player_uuid: string;
  dungeon_id: string;
  /** `normal`, `hard` ou `nightmare`. */
  difficulty: string;
  group_size: number;
  duration_ms: number;
  deaths: number;
  finished_at: number;
}

export interface DungeonsRecordsTable {
  player_uuid: string;
  dungeon_id: string;
  difficulty: string;
  completions: number;
  best_time_ms: number;
  first_completed_at: number;
  last_completed_at: number;
}

export interface DungeonsLootClaimsTable {
  player_uuid: string;
  dungeon_id: string;
  difficulty: string;
  claimed_at: number;
}

export interface DungeonsTowerProgressTable {
  player_uuid: string;
  tower_id: string;
  highest_floor: number;
  updated_at: number;
}

export interface DungeonsTables {
  dungeons_runs: DungeonsRunsTable;
  dungeons_records: DungeonsRecordsTable;
  dungeons_loot_claims: DungeonsLootClaimsTable;
  dungeons_tower_progress: DungeonsTowerProgressTable;
}
