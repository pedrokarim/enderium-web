/** Les joueurs : liste, recherche, fiche, estimation des connectés. */
import { sql, type Expression, type SqlBool } from 'kysely';
import { z } from 'zod';

import { chunk, type DbContext } from '../internal/context';
import { looksLikeUuid, parseInput, uuidSchema } from '../internal/input';
import { toBool, toInt, toTextOrNull } from '../internal/numbers';
import { SERVER_ONLINE_WINDOW_MS } from '../link/constants';
import { emptyPage, offsetOf, pageShape, toPage, type Page, type PageInput } from '../pagination';

/** Le grade affiché à côté d'un joueur : son groupe actif de plus fort poids, hors contexte. */
export interface PlayerGroupBadge {
  id: string;
  /** Clé de traduction du nom affiché. */
  displayName: string;
  color: string;
  weight: number;
  staff: boolean;
}

export interface PlayerSummary {
  uuid: string;
  /** Dernier pseudo connu. */
  name: string;
  gameMode: string;
  firstSeenAt: number;
  lastConnectionAt: number;
  lastDisconnectionAt: number;
  /** La plus récente des deux dates précédentes. */
  lastSeenAt: number;
  /**
   * Estimation : vrai si la dernière connexion est postérieure à la dernière déconnexion. Un
   * arrêt brutal du serveur laisse cette trace ; voir {@link PlayersRepository.onlineEstimate}.
   */
  online: boolean;
  /** Solde du compte, `null` sans compte ou sans module d'économie. */
  balance: number | null;
  /** `null` sans grade ou sans module de permissions. */
  primaryGroup: PlayerGroupBadge | null;
}

export interface PlayerLocation {
  world: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface PlayerDetail extends PlayerSummary {
  /** Dernière adresse vue : donnée personnelle, à n'afficher qu'aux rôles qui en ont le droit. */
  lastIp: string | null;
  /** Où le joueur s'est déconnecté, `null` si le monde n'est pas connu. */
  lastLocation: PlayerLocation | null;
}

export type PlayerSort = 'name' | 'lastSeen' | 'firstSeen' | 'balance';

export interface PlayerListInput extends PageInput {
  /** Un UUID complet (recherche exacte) ou un morceau de pseudo, sans égard à la casse. */
  search?: string | undefined;
  /** `contains` (défaut) ou `prefix`. Sans effet sur un UUID. */
  searchMode?: 'contains' | 'prefix' | undefined;
  /** Défaut : `name`. */
  sort?: PlayerSort | undefined;
  /** Défaut : croissant pour `name`, décroissant pour le reste. */
  direction?: 'asc' | 'desc' | undefined;
}

export interface OnlineEstimate {
  /** Nombre estimé de joueurs connectés. */
  count: number;
  /**
   * D'où vient `count` : `heartbeat` (somme des battements des serveurs en ligne, fiable) ou
   * `sessions` (joueurs dont la connexion est postérieure à la déconnexion, faute de lien).
   */
  source: 'heartbeat' | 'sessions';
  /** Les joueurs en session selon `core_players`, les plus récents d'abord (200 au plus). */
  players: PlayerSummary[];
}

export interface PlayersRepository {
  list(input?: PlayerListInput): Promise<Page<PlayerSummary>>;
  /** La fiche d'un joueur, `null` s'il est inconnu. */
  get(uuid: string): Promise<PlayerDetail | null>;
  /** Le joueur qui porte exactement ce pseudo (casse indifférente), le plus récent s'il y en a deux. */
  findByName(name: string): Promise<PlayerSummary | null>;
  /** Nombre de joueurs connus. */
  count(): Promise<number>;
  /** Les derniers joueurs vus, du plus récent au plus ancien. */
  recentlySeen(limit?: number): Promise<PlayerSummary[]>;
  onlineEstimate(): Promise<OnlineEstimate>;
}

const listSchema = z.object({
  ...pageShape,
  search: z.string().trim().max(64).optional(),
  searchMode: z.enum(['contains', 'prefix']).default('contains'),
  sort: z.enum(['name', 'lastSeen', 'firstSeen', 'balance']).default('name'),
  direction: z.enum(['asc', 'desc']).optional(),
});

const limitSchema = z.number().int().min(1).max(200);
const nameSchema = z.string().trim().min(1).max(16);

const ONLINE_PLAYERS_LIMIT = 200;
const UUID_CHUNK = 500;

/** Caractère d'échappement de `LIKE` : `\` n'a pas le même sens dans les trois moteurs. */
const LIKE_ESCAPE = '!';

/** Neutralise `%` et `_` : un pseudo contient souvent `_`, qui est un joker de `LIKE`. */
export function escapeLike(text: string): string {
  return text.replace(/[!%_]/g, (character) => LIKE_ESCAPE + character);
}

const PLAYER_COLUMNS = [
  'p.player_uuid',
  'p.name',
  'p.ip',
  'p.game_mode',
  'p.first_seen_at',
  'p.last_connection_at',
  'p.last_disconnection_at',
  'p.world',
  'p.x',
  'p.y',
  'p.z',
  'p.yaw',
  'p.pitch',
] as const;

interface PlayerRow {
  player_uuid: string;
  name: string;
  ip: string;
  game_mode: string;
  first_seen_at: number;
  last_connection_at: number;
  last_disconnection_at: number;
  world: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** La plus récente des deux dates, sans `GREATEST` (absent de SQLite). */
const LAST_SEEN = sql<number>`case when ${sql.ref('p.last_connection_at')} > ${sql.ref('p.last_disconnection_at')} then ${sql.ref('p.last_connection_at')} else ${sql.ref('p.last_disconnection_at')} end`;

function searchFilter(
  search: string | undefined,
  mode: 'contains' | 'prefix',
): Expression<SqlBool> | undefined {
  if (search === undefined || search === '') return undefined;
  if (looksLikeUuid(search))
    return sql<SqlBool>`${sql.ref('p.player_uuid')} = ${search.toLowerCase()}`;
  const escaped = escapeLike(search.toLowerCase());
  const pattern = mode === 'prefix' ? `${escaped}%` : `%${escaped}%`;
  return sql<SqlBool>`lower(${sql.ref('p.name')}) like ${pattern} escape ${sql.lit(LIKE_ESCAPE)}`;
}

function toSummary(row: PlayerRow): PlayerSummary {
  const lastConnectionAt = toInt(row.last_connection_at, 'last_connection_at');
  const lastDisconnectionAt = toInt(row.last_disconnection_at, 'last_disconnection_at');
  return {
    uuid: row.player_uuid,
    name: row.name,
    gameMode: row.game_mode,
    firstSeenAt: toInt(row.first_seen_at, 'first_seen_at'),
    lastConnectionAt,
    lastDisconnectionAt,
    lastSeenAt: Math.max(lastConnectionAt, lastDisconnectionAt),
    online: lastConnectionAt > lastDisconnectionAt,
    balance: null,
    primaryGroup: null,
  };
}

export function createPlayersRepository(ctx: DbContext): PlayersRepository {
  const available = () => ctx.catalog.has('core_players');

  /** Complète les soldes et les grades d'une page de joueurs, en deux requêtes groupées. */
  async function enrich<T extends PlayerSummary>(players: T[]): Promise<T[]> {
    if (players.length === 0) return players;
    const uuids = players.map((player) => player.uuid);
    const [hasEconomy, hasPermissions] = await Promise.all([
      ctx.catalog.has('economy_accounts'),
      ctx.catalog.has('perms_members', 'perms_groups'),
    ]);

    const balances = new Map<string, number>();
    const groups = new Map<string, PlayerGroupBadge>();
    const now = ctx.now();

    for (const batch of chunk(uuids, UUID_CHUNK)) {
      if (hasEconomy) {
        const rows = await ctx.db
          .selectFrom('economy_accounts')
          .select(['uuid', 'balance'])
          .where('uuid', 'in', batch)
          .execute();
        for (const row of rows) balances.set(row.uuid, toInt(row.balance, 'balance'));
      }
      if (hasPermissions) {
        const rows = await ctx.db
          .selectFrom('perms_members as m')
          .innerJoin('perms_groups as g', 'g.group_id', 'm.group_id')
          .select([
            'm.player_uuid',
            'g.group_id',
            'g.display_name',
            'g.color',
            'g.weight',
            'g.staff',
          ])
          .where('m.player_uuid', 'in', batch)
          .where('m.context', '=', '')
          .where((eb) => eb.or([eb('m.expires_at', '=', 0), eb('m.expires_at', '>', now)]))
          .execute();
        for (const row of rows) {
          const weight = toInt(row.weight, 'weight');
          const current = groups.get(row.player_uuid);
          if (current !== undefined && current.weight >= weight) continue;
          groups.set(row.player_uuid, {
            id: row.group_id,
            displayName: row.display_name,
            color: row.color,
            weight,
            staff: toBool(row.staff, 'staff'),
          });
        }
      }
    }

    for (const player of players) {
      player.balance = balances.get(player.uuid) ?? null;
      player.primaryGroup = groups.get(player.uuid) ?? null;
    }
    return players;
  }

  async function count(): Promise<number> {
    if (!(await available())) return 0;
    const row = await ctx.db
      .selectFrom('core_players')
      .select((eb) => eb.fn.countAll().as('total'))
      .executeTakeFirstOrThrow();
    return toInt(row.total, 'total');
  }

  async function recentlySeen(limit = 10): Promise<PlayerSummary[]> {
    const size = parseInput(limitSchema, limit, 'Limite invalide');
    if (!(await available())) return [];
    const rows = await ctx.db
      .selectFrom('core_players as p')
      .select(PLAYER_COLUMNS)
      .orderBy(LAST_SEEN, 'desc')
      .orderBy('p.player_uuid')
      .limit(size)
      .execute();
    return enrich(rows.map(toSummary));
  }

  return {
    async list(input = {}) {
      const query = parseInput(listSchema, input, 'Liste de joueurs invalide');
      if (!(await available())) return emptyPage(query);

      const filter = searchFilter(query.search, query.searchMode);
      const direction = query.direction ?? (query.sort === 'name' ? 'asc' : 'desc');
      const sortByBalance = query.sort === 'balance' && (await ctx.catalog.has('economy_accounts'));

      let counting = ctx.db
        .selectFrom('core_players as p')
        .select((eb) => eb.fn.countAll().as('total'));
      if (filter !== undefined) counting = counting.where(filter);

      let rows: PlayerRow[];
      if (sortByBalance) {
        let selecting = ctx.db
          .selectFrom('core_players as p')
          .leftJoin('economy_accounts as a', 'a.uuid', 'p.player_uuid')
          .select(PLAYER_COLUMNS);
        if (filter !== undefined) selecting = selecting.where(filter);
        rows = await selecting
          .orderBy(sql`coalesce(${sql.ref('a.balance')}, 0)`, direction)
          .orderBy('p.player_uuid')
          .limit(query.pageSize)
          .offset(offsetOf(query))
          .execute();
      } else {
        let selecting = ctx.db.selectFrom('core_players as p').select(PLAYER_COLUMNS);
        if (filter !== undefined) selecting = selecting.where(filter);
        selecting =
          query.sort === 'lastSeen'
            ? selecting.orderBy(LAST_SEEN, direction)
            : query.sort === 'firstSeen'
              ? selecting.orderBy('p.first_seen_at', direction)
              : selecting.orderBy(sql`lower(${sql.ref('p.name')})`, direction);
        rows = await selecting
          .orderBy('p.player_uuid')
          .limit(query.pageSize)
          .offset(offsetOf(query))
          .execute();
      }

      const total = toInt((await counting.executeTakeFirstOrThrow()).total, 'total');
      return toPage(await enrich(rows.map(toSummary)), total, query);
    },

    async get(uuid) {
      const id = parseInput(uuidSchema, uuid, 'UUID de joueur invalide');
      if (!(await available())) return null;
      const row = await ctx.db
        .selectFrom('core_players as p')
        .select(PLAYER_COLUMNS)
        .where('p.player_uuid', '=', id)
        .executeTakeFirst();
      if (row === undefined) return null;
      const detail: PlayerDetail = {
        ...toSummary(row),
        lastIp: toTextOrNull(row.ip),
        lastLocation:
          row.world === ''
            ? null
            : { world: row.world, x: row.x, y: row.y, z: row.z, yaw: row.yaw, pitch: row.pitch },
      };
      const [enriched] = await enrich([detail]);
      return enriched ?? detail;
    },

    async findByName(name) {
      const wanted = parseInput(nameSchema, name, 'Pseudo invalide').toLowerCase();
      if (!(await available())) return null;
      const row = await ctx.db
        .selectFrom('core_players as p')
        .select(PLAYER_COLUMNS)
        .where(sql<SqlBool>`lower(${sql.ref('p.name')}) = ${wanted}`)
        .orderBy(LAST_SEEN, 'desc')
        .limit(1)
        .executeTakeFirst();
      if (row === undefined) return null;
      const [enriched] = await enrich([toSummary(row)]);
      return enriched ?? null;
    },

    count,
    recentlySeen,

    async onlineEstimate() {
      let players: PlayerSummary[] = [];
      let inSession = 0;
      if (await available()) {
        const inSessionFilter = sql<SqlBool>`${sql.ref('p.last_connection_at')} > ${sql.ref('p.last_disconnection_at')}`;
        const [rows, counted] = await Promise.all([
          ctx.db
            .selectFrom('core_players as p')
            .select(PLAYER_COLUMNS)
            .where(inSessionFilter)
            .orderBy('p.last_connection_at', 'desc')
            .orderBy('p.player_uuid')
            .limit(ONLINE_PLAYERS_LIMIT)
            .execute(),
          ctx.db
            .selectFrom('core_players as p')
            .select((eb) => eb.fn.countAll().as('total'))
            .where(inSessionFilter)
            .executeTakeFirstOrThrow(),
        ]);
        players = await enrich(rows.map(toSummary));
        inSession = toInt(counted.total, 'total');
      }

      if (!(await ctx.catalog.has('link_servers')))
        return { count: inSession, source: 'sessions', players };

      // Le battement des serveurs fait foi : sans serveur en ligne, personne n'est connecté, même
      // si un arrêt brutal a laissé des sessions ouvertes dans `core_players`.
      const servers = await ctx.db
        .selectFrom('link_servers')
        .select(['online_players'])
        .where('seen_at', '>', ctx.now() - SERVER_ONLINE_WINDOW_MS)
        .execute();
      const connected = servers.reduce(
        (sum, server) => sum + toInt(server.online_players, 'online_players'),
        0,
      );
      return {
        count: connected,
        source: 'heartbeat',
        players: servers.length === 0 ? [] : players,
      };
    },
  };
}
