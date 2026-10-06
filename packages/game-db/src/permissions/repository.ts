/**
 * Les rôles et permissions : groupes (reflet en base du catalogue du dépôt de jeu), héritage,
 * appartenances, nœuds, valeurs nommées et journal des changements.
 */
import { z } from 'zod';

import type { DbContext } from '../internal/context';
import {
  NIL_UUID,
  identifierSchema,
  parseInput,
  timeRangeShape,
  uuidSchema,
} from '../internal/input';
import { toBool, toInt, toTextOrNull } from '../internal/numbers';
import { emptyPage, offsetOf, pageShape, toPage, type Page, type PageInput } from '../pagination';
import { lookupPlayerNames } from '../players/names';

export interface PermissionGroup {
  id: string;
  /** Clé de traduction du nom affiché. */
  displayName: string;
  /** Poids : trie les grades, et tranche entre deux groupes d'un même joueur. */
  weight: number;
  /** Étiquette en MiniMessage. */
  prefix: string;
  suffix: string;
  /** Couleur hexadécimale (`#fa4943`). */
  color: string;
  /** Vrai pour un grade d'équipe. */
  staff: boolean;
  /** Groupes dont il hérite directement. */
  parents: string[];
  /** Tous les groupes dont il hérite, directs puis indirects, sans doublon. */
  ancestors: string[];
  /** Joueurs dont l'appartenance est en cours, tous contextes confondus. */
  memberCount: number;
  /** Valeurs nommées propres au groupe (`homes.slots` → `15`). */
  meta: Record<string, string>;
}

export interface PermissionNode {
  /** Le nœud, joker final permis (`enderium.cosmetics.*`). */
  permission: string;
  /** Vrai : accordée ; faux : retirée. */
  value: boolean;
  /** Contexte où le nœud vaut (`world=enderium`), `null` pour partout. */
  context: string | null;
  /** Fin de validité, `null` pour sans fin. */
  expiresAt: number | null;
  /** Vrai si `expiresAt` est dépassé. */
  expired: boolean;
}

export interface InheritedPermissionNode extends PermissionNode {
  /** L'ancêtre qui porte ce nœud. */
  fromGroupId: string;
}

export interface GroupMember {
  playerUuid: string;
  playerName: string | null;
  context: string | null;
  expiresAt: number | null;
  /** Faux si l'appartenance est expirée. */
  active: boolean;
  /** UUID de l'auteur, `import` pour la reprise des anciens grades, `null` pour le serveur. */
  grantedBy: string | null;
  grantedByName: string | null;
  grantedAt: number;
}

export interface PermissionGroupDetail extends PermissionGroup {
  /** Groupes qui héritent directement de celui-ci. */
  children: string[];
  /** Nœuds posés sur le groupe lui-même. */
  nodes: PermissionNode[];
  /** Nœuds reçus de ses ancêtres. */
  inheritedNodes: InheritedPermissionNode[];
  /** Les appartenances les plus récentes (100 au plus) ; la liste complète : `members()`. */
  members: GroupMember[];
}

export interface Membership {
  groupId: string;
  /** Le groupe, `null` s'il a disparu du catalogue. */
  group: PermissionGroup | null;
  context: string | null;
  expiresAt: number | null;
  active: boolean;
  grantedBy: string | null;
  grantedByName: string | null;
  grantedAt: number;
}

/** Ce qui est posé sur un joueur en propre, hors de ses groupes. */
export interface PlayerPermissionOverrides {
  nodes: PermissionNode[];
  meta: Record<string, string>;
}

export interface PermissionLogEntry {
  id: number;
  at: number;
  /** `null` : le serveur. */
  actorUuid: string | null;
  actorName: string | null;
  /** `member.add`, `member.remove`, `member.set`, `member.expire`, `node.add`, `node.remove`, `group.permission`, `import`… */
  action: string;
  /** `group` ou `player`. */
  targetType: string;
  targetId: string;
  /** Pseudo de la cible quand c'est un joueur connu. */
  targetName: string | null;
  /** Ce qui a changé, lisible (`hero 30d`, `enderium.zones.admin=true`). */
  detail: string;
  reason: string | null;
}

export interface PermissionLogInput extends PageInput {
  action?: string | undefined;
  targetType?: 'group' | 'player' | undefined;
  targetId?: string | undefined;
  actorUuid?: string | undefined;
  from?: number | undefined;
  to?: number | undefined;
}

export interface PermissionsRepository {
  /** Tous les groupes, du plus fort poids au plus faible. Vide si le module manque. */
  groups(): Promise<PermissionGroup[]>;
  /** Un groupe complet, `null` s'il n'existe pas. */
  group(id: string): Promise<PermissionGroupDetail | null>;
  /** Les appartenances d'un groupe, les plus récentes d'abord. */
  members(groupId: string, input?: PageInput): Promise<Page<GroupMember>>;
  /** Les groupes d'un joueur, du plus fort poids au plus faible, expirés compris. */
  membershipsOf(uuid: string): Promise<Membership[]>;
  /** Les nœuds et valeurs posés directement sur un joueur. */
  overridesOf(uuid: string): Promise<PlayerPermissionOverrides>;
  /** Le journal, du plus récent au plus ancien. */
  log(input?: PermissionLogInput): Promise<Page<PermissionLogEntry>>;
}

const GROUP_TABLES = [
  'perms_groups',
  'perms_group_parents',
  'perms_members',
  'perms_meta',
] as const;
const DETAIL_MEMBER_LIMIT = 100;

const groupIdSchema = identifierSchema(64);
const pageSchema = z.object(pageShape);
const logSchema = z.object({
  ...pageShape,
  ...timeRangeShape,
  action: identifierSchema(32).optional(),
  targetType: z.enum(['group', 'player']).optional(),
  targetId: identifierSchema(64).optional(),
  actorUuid: uuidSchema.optional(),
});

/** L'acteur d'un journal : vide ou UUID nul, c'est le serveur. */
export function actorOrNull(actor: string | null): string | null {
  return actor === null || actor === '' || actor === NIL_UUID ? null : actor;
}

/** Tous les ancêtres d'un groupe, les plus proches d'abord ; un cycle ne boucle pas. */
function ancestorsOf(id: string, parents: ReadonlyMap<string, string[]>): string[] {
  const seen = new Set<string>([id]);
  const ordered: string[] = [];
  let frontier = parents.get(id) ?? [];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const parent of frontier) {
      if (seen.has(parent)) continue;
      seen.add(parent);
      ordered.push(parent);
      next.push(...(parents.get(parent) ?? []));
    }
    frontier = next;
  }
  return ordered;
}

interface NodeRow {
  permission: string;
  value: number;
  context: string;
  expires_at: number;
}

interface MemberRow {
  player_uuid: string;
  context: string;
  expires_at: number;
  granted_by: string;
  granted_at: number;
}

export function createPermissionsRepository(ctx: DbContext): PermissionsRepository {
  const available = () => ctx.catalog.has(...GROUP_TABLES);

  const isExpired = (expiresAt: number, now: number) => expiresAt !== 0 && expiresAt <= now;

  function toNode(row: NodeRow, now: number): PermissionNode {
    const expiresAt = toInt(row.expires_at, 'expires_at');
    return {
      permission: row.permission,
      value: toBool(row.value, 'value'),
      context: toTextOrNull(row.context),
      expiresAt: expiresAt === 0 ? null : expiresAt,
      expired: isExpired(expiresAt, now),
    };
  }

  async function toMembers(rows: MemberRow[]): Promise<GroupMember[]> {
    const now = ctx.now();
    const names = await lookupPlayerNames(
      ctx,
      rows.flatMap((row) => [row.player_uuid, row.granted_by]),
    );
    return rows.map((row) => {
      const expiresAt = toInt(row.expires_at, 'expires_at');
      const grantedBy = toTextOrNull(row.granted_by);
      return {
        playerUuid: row.player_uuid,
        playerName: names.get(row.player_uuid) ?? null,
        context: toTextOrNull(row.context),
        expiresAt: expiresAt === 0 ? null : expiresAt,
        active: !isExpired(expiresAt, now),
        grantedBy,
        grantedByName: grantedBy === null ? null : (names.get(grantedBy) ?? null),
        grantedAt: toInt(row.granted_at, 'granted_at'),
      };
    });
  }

  async function groups(): Promise<PermissionGroup[]> {
    if (!(await available())) return [];
    const now = ctx.now();
    const [groupRows, parentRows, metaRows, memberRows] = await Promise.all([
      ctx.db
        .selectFrom('perms_groups')
        .select(['group_id', 'display_name', 'weight', 'prefix', 'suffix', 'color', 'staff'])
        .execute(),
      ctx.db
        .selectFrom('perms_group_parents')
        .select(['group_id', 'parent_id'])
        .orderBy('group_id')
        .orderBy('parent_id')
        .execute(),
      ctx.db
        .selectFrom('perms_meta')
        .select(['target_id', 'meta_key', 'meta_value'])
        .where('target_type', '=', 'group')
        .orderBy('meta_key')
        .execute(),
      ctx.db
        .selectFrom('perms_members')
        .select((eb) => ['group_id', eb.fn.count('player_uuid').distinct().as('members')])
        .where((eb) => eb.or([eb('expires_at', '=', 0), eb('expires_at', '>', now)]))
        .groupBy('group_id')
        .execute(),
    ]);

    const parents = new Map<string, string[]>();
    for (const row of parentRows)
      parents.set(row.group_id, [...(parents.get(row.group_id) ?? []), row.parent_id]);
    const meta = new Map<string, Record<string, string>>();
    for (const row of metaRows) {
      const values = meta.get(row.target_id) ?? {};
      values[row.meta_key] = row.meta_value;
      meta.set(row.target_id, values);
    }
    const members = new Map(memberRows.map((row) => [row.group_id, toInt(row.members, 'members')]));

    return groupRows
      .map((row) => ({
        id: row.group_id,
        displayName: row.display_name,
        weight: toInt(row.weight, 'weight'),
        prefix: row.prefix,
        suffix: row.suffix,
        color: row.color,
        staff: toBool(row.staff, 'staff'),
        parents: parents.get(row.group_id) ?? [],
        ancestors: ancestorsOf(row.group_id, parents),
        memberCount: members.get(row.group_id) ?? 0,
        meta: meta.get(row.group_id) ?? {},
      }))
      .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  }

  return {
    groups,

    async group(id) {
      const groupId = parseInput(groupIdSchema, id, 'Identifiant de groupe invalide');
      const all = await groups();
      const group = all.find((candidate) => candidate.id === groupId);
      if (group === undefined) return null;

      const now = ctx.now();
      const hasNodes = await ctx.catalog.has('perms_nodes');
      const nodeTargets = [group.id, ...group.ancestors];
      const [nodeRows, memberRows] = await Promise.all([
        hasNodes
          ? ctx.db
              .selectFrom('perms_nodes')
              .select(['target_id', 'permission', 'value', 'context', 'expires_at'])
              .where('target_type', '=', 'group')
              .where('target_id', 'in', nodeTargets)
              .orderBy('permission')
              .orderBy('context')
              .execute()
          : [],
        ctx.db
          .selectFrom('perms_members')
          .select(['player_uuid', 'context', 'expires_at', 'granted_by', 'granted_at'])
          .where('group_id', '=', group.id)
          .orderBy('granted_at', 'desc')
          .orderBy('player_uuid')
          .limit(DETAIL_MEMBER_LIMIT)
          .execute(),
      ]);

      const nodes: PermissionNode[] = [];
      const inherited: InheritedPermissionNode[] = [];
      for (const row of nodeRows) {
        if (row.target_id === group.id) nodes.push(toNode(row, now));
        else inherited.push({ ...toNode(row, now), fromGroupId: row.target_id });
      }
      // Les nœuds hérités dans l'ordre de l'héritage : l'ancêtre le plus proche d'abord.
      const distance = new Map(group.ancestors.map((ancestor, index) => [ancestor, index]));
      inherited.sort(
        (a, b) =>
          (distance.get(a.fromGroupId) ?? 0) - (distance.get(b.fromGroupId) ?? 0) ||
          a.permission.localeCompare(b.permission),
      );

      return {
        ...group,
        children: all
          .filter((candidate) => candidate.parents.includes(group.id))
          .map((candidate) => candidate.id),
        nodes,
        inheritedNodes: inherited,
        members: await toMembers(memberRows),
      };
    },

    async members(groupId, input = {}) {
      const id = parseInput(groupIdSchema, groupId, 'Identifiant de groupe invalide');
      const page = parseInput(pageSchema, input, 'Pagination invalide');
      if (!(await ctx.catalog.has('perms_members'))) return emptyPage(page);
      const filtered = ctx.db.selectFrom('perms_members').where('group_id', '=', id);
      const [rows, counted] = await Promise.all([
        filtered
          .select(['player_uuid', 'context', 'expires_at', 'granted_by', 'granted_at'])
          .orderBy('granted_at', 'desc')
          .orderBy('player_uuid')
          .orderBy('context')
          .limit(page.pageSize)
          .offset(offsetOf(page))
          .execute(),
        filtered.select((eb) => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
      ]);
      return toPage(await toMembers(rows), toInt(counted.total, 'total'), page);
    },

    async membershipsOf(uuid) {
      const id = parseInput(uuidSchema, uuid, 'UUID de joueur invalide');
      if (!(await available())) return [];
      const [rows, all] = await Promise.all([
        ctx.db
          .selectFrom('perms_members')
          .select(['group_id', 'context', 'expires_at', 'granted_by', 'granted_at'])
          .where('player_uuid', '=', id)
          .execute(),
        groups(),
      ]);
      const byId = new Map(all.map((group) => [group.id, group]));
      const now = ctx.now();
      const names = await lookupPlayerNames(
        ctx,
        rows.map((row) => row.granted_by),
      );
      return rows
        .map((row): Membership => {
          const expiresAt = toInt(row.expires_at, 'expires_at');
          const grantedBy = toTextOrNull(row.granted_by);
          return {
            groupId: row.group_id,
            group: byId.get(row.group_id) ?? null,
            context: toTextOrNull(row.context),
            expiresAt: expiresAt === 0 ? null : expiresAt,
            active: !isExpired(expiresAt, now),
            grantedBy,
            grantedByName: grantedBy === null ? null : (names.get(grantedBy) ?? null),
            grantedAt: toInt(row.granted_at, 'granted_at'),
          };
        })
        .sort(
          (a, b) =>
            (b.group?.weight ?? -Infinity) - (a.group?.weight ?? -Infinity) ||
            a.groupId.localeCompare(b.groupId),
        );
    },

    async overridesOf(uuid) {
      const id = parseInput(uuidSchema, uuid, 'UUID de joueur invalide');
      const [hasNodes, hasMeta] = await Promise.all([
        ctx.catalog.has('perms_nodes'),
        ctx.catalog.has('perms_meta'),
      ]);
      const now = ctx.now();
      const [nodeRows, metaRows] = await Promise.all([
        hasNodes
          ? ctx.db
              .selectFrom('perms_nodes')
              .select(['permission', 'value', 'context', 'expires_at'])
              .where('target_type', '=', 'player')
              .where('target_id', '=', id)
              .orderBy('permission')
              .orderBy('context')
              .execute()
          : [],
        hasMeta
          ? ctx.db
              .selectFrom('perms_meta')
              .select(['meta_key', 'meta_value'])
              .where('target_type', '=', 'player')
              .where('target_id', '=', id)
              .orderBy('meta_key')
              .execute()
          : [],
      ]);
      return {
        nodes: nodeRows.map((row) => toNode(row, now)),
        meta: Object.fromEntries(metaRows.map((row) => [row.meta_key, row.meta_value])),
      };
    },

    async log(input = {}) {
      const query = parseInput(logSchema, input, 'Filtre du journal invalide');
      if (!(await ctx.catalog.has('perms_log'))) return emptyPage(query);

      const { action, targetType, targetId, actorUuid, from, to } = query;
      const filtered = ctx.db
        .selectFrom('perms_log')
        .$if(action !== undefined, (qb) => qb.where('action', '=', action as string))
        .$if(targetType !== undefined, (qb) => qb.where('target_type', '=', targetType as string))
        .$if(targetId !== undefined, (qb) => qb.where('target_id', '=', targetId as string))
        .$if(actorUuid !== undefined, (qb) => qb.where('actor_uuid', '=', actorUuid as string))
        .$if(from !== undefined, (qb) => qb.where('at', '>=', from as number))
        .$if(to !== undefined, (qb) => qb.where('at', '<', to as number));

      const [rows, counted] = await Promise.all([
        filtered
          .select([
            'id',
            'at',
            'actor_uuid',
            'action',
            'target_type',
            'target_id',
            'detail',
            'reason',
          ])
          .orderBy('at', 'desc')
          .orderBy('id', 'desc')
          .limit(query.pageSize)
          .offset(offsetOf(query))
          .execute(),
        filtered.select((eb) => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
      ]);

      const names = await lookupPlayerNames(
        ctx,
        rows.flatMap((row) => [
          row.actor_uuid,
          row.target_type === 'player' ? row.target_id : null,
        ]),
      );
      const entries = rows.map((row): PermissionLogEntry => {
        const actorUuid = actorOrNull(row.actor_uuid);
        return {
          id: toInt(row.id, 'id'),
          at: toInt(row.at, 'at'),
          actorUuid,
          actorName: actorUuid === null ? null : (names.get(actorUuid) ?? null),
          action: row.action,
          targetType: row.target_type,
          targetId: row.target_id,
          targetName: row.target_type === 'player' ? (names.get(row.target_id) ?? null) : null,
          detail: row.detail,
          reason: toTextOrNull(row.reason),
        };
      });
      return toPage(entries, toInt(counted.total, 'total'), query);
    },
  };
}
