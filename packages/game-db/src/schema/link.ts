/**
 * Tables du lien site → serveur (`link_*`), définies par `docs/contracts/intents.md`, et table des
 * versions du schéma (`enderium_schema`). `link_intents` est la seule table où ce package écrit,
 * et il n'y fait qu'insérer.
 */

export interface LinkIntentsTable {
  id: string;
  idempotency_key: string;
  kind: string;
  payload: string;
  target_server: string;
  actor_id: string;
  actor_name: string;
  actor_uuid: string;
  reason: string;
  /** `pending`, `running`, `done`, `refused`, `failed`, `expired`. */
  status: string;
  created_at: number;
  expires_at: number;
  claimed_at: number;
  claimed_by: string;
  finished_at: number;
  result_code: string;
  result_detail: string;
  signature: string;
}

export interface LinkServersTable {
  server_id: string;
  started_at: number;
  seen_at: number;
  plugin_version: string;
  minecraft_version: string;
  online_players: number;
  max_players: number;
  tps_centi: number;
  mspt_centi: number;
}

/** Une ligne par migration appliquée d'un module. */
export interface EnderiumSchemaTable {
  module: string;
  version: number;
  description: string;
  applied_at: number;
}

export interface LinkTables {
  link_intents: LinkIntentsTable;
  link_servers: LinkServersTable;
  enderium_schema: EnderiumSchemaTable;
}
