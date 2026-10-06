/**
 * Tables des zones (`regions_*`), écrites par le plugin EnderiumRegions.
 * Sens des colonnes : `enderium-core/docs/data/regions.md`.
 */
import type { Generated } from 'kysely';

export interface RegionsZonesTable {
  zone_id: string;
  world: string;
  /** `cuboid`, `polygon`, `chunk`, `global`. */
  shape: string;
  priority: number;
  parent_id: string;
  owner_uuid: string;
  created_at: number;
}

export interface RegionsShapesTable {
  world: string;
  zone_id: string;
  ordinal: number;
  x: number;
  z: number;
  y_min: number;
  y_max: number;
}

export interface RegionsFlagsTable {
  world: string;
  zone_id: string;
  flag: string;
  value: string;
  set_by: string;
  set_at: number;
}

export interface RegionsMembersTable {
  world: string;
  zone_id: string;
  /** `player`, `group`, `faction`, `coop`. */
  member_type: string;
  member_id: string;
  /** `owner`, `manager`, `member`, `worker`, `visitor`. */
  role: string;
  added_at: number;
}

export interface RegionsLogTable {
  id: Generated<number>;
  at: number;
  actor_uuid: string;
  world: string;
  zone_id: string;
  action: string;
  detail: string;
}

export interface RegionsTables {
  regions_zones: RegionsZonesTable;
  regions_shapes: RegionsShapesTable;
  regions_flags: RegionsFlagsTable;
  regions_members: RegionsMembersTable;
  regions_log: RegionsLogTable;
}
