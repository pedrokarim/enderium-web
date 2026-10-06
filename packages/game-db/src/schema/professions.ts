/** Tables des métiers (`professions_*`). Sens des colonnes : `enderium-core/docs/data/professions.md`. */

export interface ProfessionsXpTable {
  player_uuid: string;
  profession_id: string;
  xp: number;
  updated_at: number;
}

export interface ProfessionsMasteryTable {
  player_uuid: string;
  /** `crop`, `fish`, `ore`. */
  kind: string;
  source_id: string;
  count: number;
  first_at: number;
  updated_at: number;
}

export interface ProfessionsTables {
  professions_xp: ProfessionsXpTable;
  professions_mastery: ProfessionsMasteryTable;
}
