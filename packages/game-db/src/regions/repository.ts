/** Les zones du monde : formes, drapeaux, membres et journal des changements. */
import { z } from 'zod';

import type { DbContext } from '../internal/context';
import { identifierSchema, parseInput, timeRangeShape, uuidSchema } from '../internal/input';
import { toInt, toTextOrNull } from '../internal/numbers';
import { emptyPage, offsetOf, pageShape, toPage, type Page, type PageInput } from '../pagination';
import { actorOrNull } from '../permissions/repository';
import { lookupPlayerNames } from '../players/names';

export interface Zone {
  world: string;
  /** Identifiant de la zone, unique par monde. */
  id: string;
  /** `cuboid`, `polygon`, `chunk` ou `global`. */
  shape: string;
  /** Priorité : la plus forte tranche la première. */
  priority: number;
  /** Zone dont elle hérite les drapeaux non tranchés, `null` sinon. */
  parentId: string | null;
  /** Propriétaire, `null` pour une zone du serveur. */
  ownerUuid: string | null;
  ownerName: string | null;
  createdAt: number;
  /** Nombre de points de la forme. */
  pointCount: number;
  flagCount: number;
  memberCount: number;
}

export interface ZonePoint {
  /** Rang du point, à partir de 0. */
  ordinal: number;
  /** Abscisse du bloc, ou du chunk pour une forme `chunk`. */
  x: number;
  z: number;
  yMin: number;
  yMax: number;
}

export interface ZoneFlag {
  flag: string;
  /** `allow`, `deny`, `members`, `workers`, `owner`, une clé de traduction ou une expression. */
  value: string;
  /** Qui l'a réglé, `null` pour le serveur. */
  setBy: string | null;
  setByName: string | null;
  setAt: number;
}

export interface ZoneMember {
  /** `player`, `group`, `faction` ou `coop`. */
  type: string;
  /** UUID du joueur, ou identifiant du groupe, de la faction, de la coopérative. */
  id: string;
  /** Pseudo quand le membre est un joueur connu. */
  name: string | null;
  /** `owner`, `manager`, `member`, `worker` ou `visitor`. */
  role: string;
  addedAt: number;
}

/** L'emprise d'une zone, dans l'unité de ses points (blocs, ou chunks pour une forme `chunk`). */
export interface ZoneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export interface ZoneDetail extends Zone {
  points: ZonePoint[];
  /** `null` pour une zone sans point (forme `global`). */
  bounds: ZoneBounds | null;
  flags: ZoneFlag[];
  members: ZoneMember[];
  /** Zones du même monde qui héritent de celle-ci. */
  children: string[];
}

export interface RegionLogEntry {
  id: number;
  at: number;
  /** `null` : le serveur. */
  actorUuid: string | null;
  actorName: string | null;
  world: string;
  zoneId: string;
  /** `create`, `delete`, `redefine`, `flag`, `member`, `priority`, `parent`. */
  action: string;
  /** Ce qui a changé, lisible (`build=members`, `+worker Untel`). */
  detail: string;
}

export interface RegionLogInput extends PageInput {
  world?: string | undefined;
  zoneId?: string | undefined;
  action?: string | undefined;
  actorUuid?: string | undefined;
  from?: number | undefined;
  to?: number | undefined;
}

export interface RegionsRepository {
  /** Toutes les zones, par monde puis priorité décroissante. Vide si le module manque. */
  zones(): Promise<Zone[]>;
  /** Une zone complète, `null` si elle n'existe pas. */
  zone(world: string, id: string): Promise<ZoneDetail | null>;
  /** Le journal, du plus récent au plus ancien. */
  log(input?: RegionLogInput): Promise<Page<RegionLogEntry>>;
}

const ZONE_TABLES = [
  'regions_zones',
  'regions_shapes',
  'regions_flags',
  'regions_members',
] as const;

const worldSchema = identifierSchema(64);
const zoneIdSchema = identifierSchema(64);
const logSchema = z.object({
  ...pageShape,
  ...timeRangeShape,
  world: worldSchema.optional(),
  zoneId: zoneIdSchema.optional(),
  action: identifierSchema(32).optional(),
  actorUuid: uuidSchema.optional(),
});

/** Clé d'une zone dans une table de correspondance (un monde ne contient pas de retour à la ligne). */
const zoneKey = (world: string, id: string) => `${world}\n${id}`;

function boundsOf(points: ZonePoint[]): ZoneBounds | null {
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
    minY: Math.min(...points.map((point) => point.yMin)),
    maxY: Math.max(...points.map((point) => point.yMax)),
  };
}

export function createRegionsRepository(ctx: DbContext): RegionsRepository {
  const available = () => ctx.catalog.has(...ZONE_TABLES);

  async function countsBy(
    table: 'regions_shapes' | 'regions_flags' | 'regions_members',
  ): Promise<Map<string, number>> {
    const rows = await ctx.db
      .selectFrom(table)
      .select((eb) => ['world', 'zone_id', eb.fn.countAll().as('total')])
      .groupBy(['world', 'zone_id'])
      .execute();
    return new Map(rows.map((row) => [zoneKey(row.world, row.zone_id), toInt(row.total, 'total')]));
  }

  async function zones(): Promise<Zone[]> {
    if (!(await available())) return [];
    const [rows, points, flags, members] = await Promise.all([
      ctx.db
        .selectFrom('regions_zones')
        .select(['zone_id', 'world', 'shape', 'priority', 'parent_id', 'owner_uuid', 'created_at'])
        .orderBy('world')
        .orderBy('priority', 'desc')
        .orderBy('zone_id')
        .execute(),
      countsBy('regions_shapes'),
      countsBy('regions_flags'),
      countsBy('regions_members'),
    ]);
    const names = await lookupPlayerNames(
      ctx,
      rows.map((row) => row.owner_uuid),
    );
    return rows.map((row) => {
      const key = zoneKey(row.world, row.zone_id);
      const ownerUuid = toTextOrNull(row.owner_uuid);
      return {
        world: row.world,
        id: row.zone_id,
        shape: row.shape,
        priority: toInt(row.priority, 'priority'),
        parentId: toTextOrNull(row.parent_id),
        ownerUuid,
        ownerName: ownerUuid === null ? null : (names.get(ownerUuid) ?? null),
        createdAt: toInt(row.created_at, 'created_at'),
        pointCount: points.get(key) ?? 0,
        flagCount: flags.get(key) ?? 0,
        memberCount: members.get(key) ?? 0,
      };
    });
  }

  return {
    zones,

    async zone(world, id) {
      const worldName = parseInput(worldSchema, world, 'Monde invalide');
      const zoneId = parseInput(zoneIdSchema, id, 'Identifiant de zone invalide');
      if (!(await available())) return null;

      const row = await ctx.db
        .selectFrom('regions_zones')
        .select(['zone_id', 'world', 'shape', 'priority', 'parent_id', 'owner_uuid', 'created_at'])
        .where('world', '=', worldName)
        .where('zone_id', '=', zoneId)
        .executeTakeFirst();
      if (row === undefined) return null;

      const [pointRows, flagRows, memberRows, childRows] = await Promise.all([
        ctx.db
          .selectFrom('regions_shapes')
          .select(['ordinal', 'x', 'z', 'y_min', 'y_max'])
          .where('world', '=', worldName)
          .where('zone_id', '=', zoneId)
          .orderBy('ordinal')
          .execute(),
        ctx.db
          .selectFrom('regions_flags')
          .select(['flag', 'value', 'set_by', 'set_at'])
          .where('world', '=', worldName)
          .where('zone_id', '=', zoneId)
          .orderBy('flag')
          .execute(),
        ctx.db
          .selectFrom('regions_members')
          .select(['member_type', 'member_id', 'role', 'added_at'])
          .where('world', '=', worldName)
          .where('zone_id', '=', zoneId)
          .orderBy('role')
          .orderBy('added_at')
          .orderBy('member_id')
          .execute(),
        ctx.db
          .selectFrom('regions_zones')
          .select('zone_id')
          .where('world', '=', worldName)
          .where('parent_id', '=', zoneId)
          .orderBy('zone_id')
          .execute(),
      ]);

      const names = await lookupPlayerNames(ctx, [
        row.owner_uuid,
        ...flagRows.map((flag) => flag.set_by),
        ...memberRows
          .filter((member) => member.member_type === 'player')
          .map((member) => member.member_id),
      ]);
      const ownerUuid = toTextOrNull(row.owner_uuid);
      const points = pointRows.map((point) => ({
        ordinal: toInt(point.ordinal, 'ordinal'),
        x: toInt(point.x, 'x'),
        z: toInt(point.z, 'z'),
        yMin: toInt(point.y_min, 'y_min'),
        yMax: toInt(point.y_max, 'y_max'),
      }));

      return {
        world: row.world,
        id: row.zone_id,
        shape: row.shape,
        priority: toInt(row.priority, 'priority'),
        parentId: toTextOrNull(row.parent_id),
        ownerUuid,
        ownerName: ownerUuid === null ? null : (names.get(ownerUuid) ?? null),
        createdAt: toInt(row.created_at, 'created_at'),
        pointCount: points.length,
        flagCount: flagRows.length,
        memberCount: memberRows.length,
        points,
        bounds: boundsOf(points),
        flags: flagRows.map((flag) => {
          const setBy = actorOrNull(flag.set_by);
          return {
            flag: flag.flag,
            value: flag.value,
            setBy,
            setByName: setBy === null ? null : (names.get(setBy) ?? null),
            setAt: toInt(flag.set_at, 'set_at'),
          };
        }),
        members: memberRows.map((member) => ({
          type: member.member_type,
          id: member.member_id,
          name: member.member_type === 'player' ? (names.get(member.member_id) ?? null) : null,
          role: member.role,
          addedAt: toInt(member.added_at, 'added_at'),
        })),
        children: childRows.map((child) => child.zone_id),
      };
    },

    async log(input = {}) {
      const query = parseInput(logSchema, input, 'Filtre du journal invalide');
      if (!(await ctx.catalog.has('regions_log'))) return emptyPage(query);

      const { world, zoneId, action, actorUuid, from, to } = query;
      const filtered = ctx.db
        .selectFrom('regions_log')
        .$if(world !== undefined, (qb) => qb.where('world', '=', world as string))
        .$if(zoneId !== undefined, (qb) => qb.where('zone_id', '=', zoneId as string))
        .$if(action !== undefined, (qb) => qb.where('action', '=', action as string))
        .$if(actorUuid !== undefined, (qb) => qb.where('actor_uuid', '=', actorUuid as string))
        .$if(from !== undefined, (qb) => qb.where('at', '>=', from as number))
        .$if(to !== undefined, (qb) => qb.where('at', '<', to as number));

      const [rows, counted] = await Promise.all([
        filtered
          .select(['id', 'at', 'actor_uuid', 'world', 'zone_id', 'action', 'detail'])
          .orderBy('at', 'desc')
          .orderBy('id', 'desc')
          .limit(query.pageSize)
          .offset(offsetOf(query))
          .execute(),
        filtered.select((eb) => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
      ]);

      const names = await lookupPlayerNames(
        ctx,
        rows.map((row) => row.actor_uuid),
      );
      const entries = rows.map((row): RegionLogEntry => {
        const actor = actorOrNull(row.actor_uuid);
        return {
          id: toInt(row.id, 'id'),
          at: toInt(row.at, 'at'),
          actorUuid: actor,
          actorName: actor === null ? null : (names.get(actor) ?? null),
          world: row.world,
          zoneId: row.zone_id,
          action: row.action,
          detail: row.detail,
        };
      });
      return toPage(entries, toInt(counted.total, 'total'), query);
    },
  };
}
