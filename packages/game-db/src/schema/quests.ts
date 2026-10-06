/** Tables des quêtes (`quests_*`). Sens des colonnes : `enderium-core/docs/data/quests.md`. */

export interface QuestsActiveTable {
  player_uuid: string;
  quest_id: string;
  stage: number;
  /** `ACTIVE` ou `READY`. */
  status: string;
  started_at: number;
}

export interface QuestsProgressTable {
  player_uuid: string;
  quest_id: string;
  objective_id: string;
  progress: number;
}

export interface QuestsHistoryTable {
  player_uuid: string;
  quest_id: string;
  completions: number;
  last_completed_at: number;
}

export interface QuestsTrackedTable {
  player_uuid: string;
  quest_id: string;
}

export interface QuestsTables {
  quests_active: QuestsActiveTable;
  quests_progress: QuestsProgressTable;
  quests_history: QuestsHistoryTable;
  quests_tracked: QuestsTrackedTable;
}
