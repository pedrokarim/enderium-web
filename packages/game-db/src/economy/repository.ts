/**
 * L'économie : comptes, classement des fortunes, journal des mouvements et ses agrégats.
 *
 * Lecture du journal (`AccountStore.log` dans enderium-core) : `source` absent → l'argent est
 * **créé** au profit de `target` ; `target` absent → il est **détruit** depuis `source` ; les deux
 * présents → **transfert**. Les agrégats reprennent la définition du bilan en jeu (`/eco bilan`).
 */
import { sql, type SqlBool } from 'kysely';
import { z } from 'zod';

import { InvalidInputError } from '../errors';
import type { DbContext } from '../internal/context';
import {
  identifierSchema,
  parseInput,
  timeRangeShape,
  timestampSchema,
  uuidSchema,
} from '../internal/input';
import { toInt, toTextOrNull } from '../internal/numbers';
import { emptyPage, offsetOf, pageShape, toPage, type Page, type PageInput } from '../pagination';
import { lookupPlayerNames } from '../players/names';

export type LedgerMovement = 'creation' | 'destruction' | 'transfer';

export interface EconomyOverview {
  /** Nombre de comptes. */
  accounts: number;
  /** Masse monétaire : somme des soldes, dans la plus petite unité. */
  moneySupply: number;
  /** Solde moyen, 0 sans compte. */
  averageBalance: number;
  /** Solde médian (moyenne des deux soldes du milieu si le nombre de comptes est pair). */
  medianBalance: number;
  /** Plus gros solde. */
  highestBalance: number;
  /** Nombre de lignes du journal. */
  ledgerEntries: number;
  /** Date du dernier mouvement, `null` si le journal est vide. */
  lastMovementAt: number | null;
}

export interface EconomyAccount {
  uuid: string;
  /** Pseudo actuel (`core_players`), à défaut celui gardé sur le compte. */
  name: string;
  balance: number;
  updatedAt: number;
  /** Rang dans le classement des fortunes, à partir de 1 (les ex æquo partagent le rang). */
  rank: number;
}

export interface BalanceRank {
  rank: number;
  uuid: string;
  name: string;
  balance: number;
}

export interface LedgerEntry {
  id: number;
  at: number;
  /** Nature du mouvement telle qu'écrite par le jeu (`pay`, `admin`, `shop_buy`, `quest`…). */
  kind: string;
  movement: LedgerMovement;
  /** Compte débité, `null` quand l'argent est créé. */
  sourceUuid: string | null;
  sourceName: string | null;
  /** Compte crédité, `null` quand l'argent est détruit. */
  targetUuid: string | null;
  targetName: string | null;
  amount: number;
  reason: string | null;
}

export interface LedgerInput extends PageInput {
  kind?: string | undefined;
  /** Mouvements où ce joueur est la source ou la cible. */
  playerUuid?: string | undefined;
  movement?: LedgerMovement | undefined;
  /** Date minimale, incluse. */
  from?: number | undefined;
  /** Date maximale, exclue. */
  to?: number | undefined;
}

export interface TimeRangeInput {
  from?: number | undefined;
  to?: number | undefined;
}

export interface KindFlow {
  kind: string;
  created: number;
  destroyed: number;
  transferred: number;
  /** Nombre de mouvements de cette nature. */
  entries: number;
}

export interface DailyFlow {
  /** Jour local, `AAAA-MM-JJ`, dans le fuseau demandé. */
  day: string;
  created: number;
  destroyed: number;
  transferred: number;
  /** Créations moins destructions : la variation de la masse monétaire ce jour-là. */
  net: number;
  entries: number;
}

export interface DailySeriesInput extends TimeRangeInput {
  /** Fuseau des journées. Défaut : `Europe/Paris`, celui des remises à zéro du jeu. */
  timeZone?: string | undefined;
}

export interface EconomyRepository {
  /** Vue d'ensemble, `null` si le module d'économie n'est pas installé. */
  overview(): Promise<EconomyOverview | null>;
  /** Le compte d'un joueur, `null` s'il n'en a pas. */
  account(uuid: string): Promise<EconomyAccount | null>;
  /** Les plus gros soldes, du plus riche au moins riche (pseudo en cas d'égalité). */
  topBalances(limit?: number): Promise<BalanceRank[]>;
  /** Le journal, du plus récent au plus ancien. */
  ledger(input?: LedgerInput): Promise<Page<LedgerEntry>>;
  /** Les natures de mouvement présentes dans le journal, pour un filtre. */
  kinds(): Promise<string[]>;
  /** Créations, destructions et transferts par nature sur la période. */
  flowsByKind(input?: TimeRangeInput): Promise<KindFlow[]>;
  /**
   * Série quotidienne des créations et destructions. Défaut : les 30 derniers jours ; un an au
   * plus. Les jours sans mouvement sont rendus à zéro.
   */
  dailySeries(input?: DailySeriesInput): Promise<DailyFlow[]>;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_SERIES_DAYS = 30;
const MAX_SERIES_DAYS = 366;

const ledgerSchema = z.object({
  ...pageShape,
  ...timeRangeShape,
  kind: identifierSchema(24).optional(),
  playerUuid: uuidSchema.optional(),
  movement: z.enum(['creation', 'destruction', 'transfer']).optional(),
});
const rangeSchema = z.object(timeRangeShape);
const seriesSchema = z.object({
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
  timeZone: z.string().trim().min(1).max(64).default('Europe/Paris'),
});
const limitSchema = z.number().int().min(1).max(100);

// `source` et `target` sont de vrais NULL ; une chaîne vide est traitée de même, par prudence.
const SOURCE_ABSENT = sql<SqlBool>`(${sql.ref('l.source')} is null or ${sql.ref('l.source')} = '')`;
const TARGET_ABSENT = sql<SqlBool>`(${sql.ref('l.target')} is null or ${sql.ref('l.target')} = '')`;
const IS_CREATION = sql<SqlBool>`(${SOURCE_ABSENT} and not ${TARGET_ABSENT})`;
const IS_DESTRUCTION = sql<SqlBool>`(${TARGET_ABSENT} and not ${SOURCE_ABSENT})`;
const IS_TRANSFER = sql<SqlBool>`(not ${SOURCE_ABSENT} and not ${TARGET_ABSENT})`;

const MOVEMENT_FILTERS = {
  creation: IS_CREATION,
  destruction: IS_DESTRUCTION,
  transfer: IS_TRANSFER,
};

const sumWhen = (condition: typeof IS_CREATION) =>
  sql<number>`coalesce(sum(case when ${condition} then ${sql.ref('l.amount')} else 0 end), 0)`;

function movementOf(source: string | null, target: string | null): LedgerMovement {
  if (source === null) return 'creation';
  return target === null ? 'destruction' : 'transfer';
}

/** Rend `AAAA-MM-JJ` pour un instant dans un fuseau ; refuse un fuseau inconnu. */
function dayFormatter(timeZone: string): (at: number) => string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new InvalidInputError(`Fuseau horaire inconnu : ${timeZone}`, [
      { path: ['timeZone'], message: 'Fuseau horaire inconnu' },
    ]);
  }
  return (at) => {
    const parts = format.formatToParts(at);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
}

export function createEconomyRepository(ctx: DbContext): EconomyRepository {
  const hasAccounts = () => ctx.catalog.has('economy_accounts');
  const hasLedger = () => ctx.catalog.has('economy_ledger');

  async function medianBalance(accounts: number): Promise<number> {
    if (accounts === 0) return 0;
    // Portable : pas de fonction de médiane commune aux trois moteurs, on lit le ou les soldes du milieu.
    const rows = await ctx.db
      .selectFrom('economy_accounts')
      .select('balance')
      .orderBy('balance')
      .orderBy('uuid')
      .limit(accounts % 2 === 0 ? 2 : 1)
      .offset(Math.floor((accounts - 1) / 2))
      .execute();
    if (rows.length === 0) return 0;
    return rows.reduce((sum, row) => sum + toInt(row.balance, 'balance'), 0) / rows.length;
  }

  return {
    async overview() {
      if (!(await hasAccounts())) return null;
      const totals = await ctx.db
        .selectFrom('economy_accounts')
        .select((eb) => [
          eb.fn.countAll().as('accounts'),
          sql<number>`coalesce(sum(${sql.ref('balance')}), 0)`.as('supply'),
          sql<number>`coalesce(max(${sql.ref('balance')}), 0)`.as('highest'),
        ])
        .executeTakeFirstOrThrow();
      const accounts = toInt(totals.accounts, 'accounts');
      const moneySupply = toInt(totals.supply, 'supply');

      let ledgerEntries = 0;
      let lastMovementAt: number | null = null;
      if (await hasLedger()) {
        const ledger = await ctx.db
          .selectFrom('economy_ledger')
          .select((eb) => [
            eb.fn.countAll().as('entries'),
            sql<number>`coalesce(max(${sql.ref('at')}), 0)`.as('last_at'),
          ])
          .executeTakeFirstOrThrow();
        ledgerEntries = toInt(ledger.entries, 'entries');
        lastMovementAt = ledgerEntries === 0 ? null : toInt(ledger.last_at, 'last_at');
      }

      return {
        accounts,
        moneySupply,
        averageBalance: accounts === 0 ? 0 : moneySupply / accounts,
        medianBalance: await medianBalance(accounts),
        highestBalance: toInt(totals.highest, 'highest'),
        ledgerEntries,
        lastMovementAt,
      };
    },

    async account(uuid) {
      const id = parseInput(uuidSchema, uuid, 'UUID de joueur invalide');
      if (!(await hasAccounts())) return null;
      const row = await ctx.db
        .selectFrom('economy_accounts')
        .select(['uuid', 'name', 'balance', 'updated_at'])
        .where('uuid', '=', id)
        .executeTakeFirst();
      if (row === undefined) return null;
      const balance = toInt(row.balance, 'balance');
      const [richer, names] = await Promise.all([
        ctx.db
          .selectFrom('economy_accounts')
          .select((eb) => eb.fn.countAll().as('total'))
          .where('balance', '>', balance)
          .executeTakeFirstOrThrow(),
        lookupPlayerNames(ctx, [row.uuid]),
      ]);
      return {
        uuid: row.uuid,
        name: names.get(row.uuid) ?? row.name,
        balance,
        updatedAt: toInt(row.updated_at, 'updated_at'),
        rank: toInt(richer.total, 'total') + 1,
      };
    },

    async topBalances(limit = 10) {
      const size = parseInput(limitSchema, limit, 'Limite invalide');
      if (!(await hasAccounts())) return [];
      const rows = await ctx.db
        .selectFrom('economy_accounts')
        .select(['uuid', 'name', 'balance'])
        .orderBy('balance', 'desc')
        .orderBy('name')
        .orderBy('uuid')
        .limit(size)
        .execute();
      const names = await lookupPlayerNames(
        ctx,
        rows.map((row) => row.uuid),
      );
      return rows.map((row, index) => ({
        rank: index + 1,
        uuid: row.uuid,
        name: names.get(row.uuid) ?? row.name,
        balance: toInt(row.balance, 'balance'),
      }));
    },

    async ledger(input = {}) {
      const query = parseInput(ledgerSchema, input, 'Filtre du journal invalide');
      if (!(await hasLedger())) return emptyPage(query);

      const { kind, playerUuid, movement, from, to } = query;
      const filtered = ctx.db
        .selectFrom('economy_ledger as l')
        .$if(kind !== undefined, (qb) => qb.where('l.kind', '=', kind as string))
        .$if(playerUuid !== undefined, (qb) =>
          qb.where((eb) =>
            eb.or([
              eb('l.source', '=', playerUuid as string),
              eb('l.target', '=', playerUuid as string),
            ]),
          ),
        )
        .$if(movement !== undefined, (qb) => qb.where(MOVEMENT_FILTERS[movement as LedgerMovement]))
        .$if(from !== undefined, (qb) => qb.where('l.at', '>=', from as number))
        .$if(to !== undefined, (qb) => qb.where('l.at', '<', to as number));

      const [rows, counted] = await Promise.all([
        filtered
          .select(['l.id', 'l.at', 'l.kind', 'l.source', 'l.target', 'l.amount', 'l.reason'])
          .orderBy('l.at', 'desc')
          .orderBy('l.id', 'desc')
          .limit(query.pageSize)
          .offset(offsetOf(query))
          .execute(),
        filtered.select((eb) => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
      ]);

      const names = await lookupPlayerNames(
        ctx,
        rows.flatMap((row) => [row.source, row.target]),
      );
      const entries = rows.map((row): LedgerEntry => {
        const sourceUuid = toTextOrNull(row.source);
        const targetUuid = toTextOrNull(row.target);
        return {
          id: toInt(row.id, 'id'),
          at: toInt(row.at, 'at'),
          kind: row.kind,
          movement: movementOf(sourceUuid, targetUuid),
          sourceUuid,
          sourceName: sourceUuid === null ? null : (names.get(sourceUuid) ?? null),
          targetUuid,
          targetName: targetUuid === null ? null : (names.get(targetUuid) ?? null),
          amount: toInt(row.amount, 'amount'),
          reason: toTextOrNull(row.reason),
        };
      });
      return toPage(entries, toInt(counted.total, 'total'), query);
    },

    async kinds() {
      if (!(await hasLedger())) return [];
      const rows = await ctx.db
        .selectFrom('economy_ledger')
        .select('kind')
        .distinct()
        .orderBy('kind')
        .execute();
      return rows.map((row) => row.kind);
    },

    async flowsByKind(input = {}) {
      const { from, to } = parseInput(rangeSchema, input, 'Période invalide');
      if (!(await hasLedger())) return [];
      const rows = await ctx.db
        .selectFrom('economy_ledger as l')
        .select((eb) => [
          'l.kind',
          sumWhen(IS_CREATION).as('created'),
          sumWhen(IS_DESTRUCTION).as('destroyed'),
          sumWhen(IS_TRANSFER).as('transferred'),
          eb.fn.countAll().as('entries'),
        ])
        .$if(from !== undefined, (qb) => qb.where('l.at', '>=', from as number))
        .$if(to !== undefined, (qb) => qb.where('l.at', '<', to as number))
        .groupBy('l.kind')
        .orderBy('l.kind')
        .execute();
      return rows.map((row) => ({
        kind: row.kind,
        created: toInt(row.created, 'created'),
        destroyed: toInt(row.destroyed, 'destroyed'),
        transferred: toInt(row.transferred, 'transferred'),
        entries: toInt(row.entries, 'entries'),
      }));
    },

    async dailySeries(input = {}) {
      const query = parseInput(seriesSchema, input, 'Période invalide');
      const dayOf = dayFormatter(query.timeZone);
      const to = query.to ?? ctx.now();
      const from = query.from ?? to - DEFAULT_SERIES_DAYS * DAY_MS;
      if (from >= to) return [];
      if (to - from > MAX_SERIES_DAYS * DAY_MS) {
        throw new InvalidInputError(`Période trop longue : ${MAX_SERIES_DAYS} jours au plus.`, [
          { path: ['from'], message: 'Période trop longue' },
        ]);
      }

      // Les jours rendus, dans l'ordre, y compris ceux sans mouvement. On avance d'heure en heure
      // pour rester juste aux changements d'heure.
      const days = new Map<string, DailyFlow>();
      const ensureDay = (at: number): DailyFlow => {
        const day = dayOf(at);
        let flow = days.get(day);
        if (flow === undefined) {
          flow = { day, created: 0, destroyed: 0, transferred: 0, net: 0, entries: 0 };
          days.set(day, flow);
        }
        return flow;
      };
      for (let at = from; at < to; at += HOUR_MS) ensureDay(at);
      ensureDay(to - 1);

      if (!(await hasLedger())) return [...days.values()];

      // Le découpage par jour dépend du fuseau, et aucune fonction de date n'est portable : la base
      // agrège par heure UTC (arithmétique entière seulement), le regroupement en jours locaux se
      // fait ici. Exact pour les fuseaux à décalage d'heures entières.
      const bucket = sql<number>`(${sql.ref('l.at')} - (${sql.ref('l.at')} % ${sql.lit(HOUR_MS)}))`;
      const rows = await ctx.db
        .selectFrom('economy_ledger as l')
        .select((eb) => [
          bucket.as('bucket'),
          sumWhen(IS_CREATION).as('created'),
          sumWhen(IS_DESTRUCTION).as('destroyed'),
          sumWhen(IS_TRANSFER).as('transferred'),
          eb.fn.countAll().as('entries'),
        ])
        .where('l.at', '>=', from)
        .where('l.at', '<', to)
        .groupBy(bucket)
        .orderBy(bucket)
        .execute();

      for (const row of rows) {
        // Une heure à cheval sur `from` commence avant lui : on la range au jour de `from`.
        const flow = ensureDay(Math.max(toInt(row.bucket, 'bucket'), from));
        flow.created += toInt(row.created, 'created');
        flow.destroyed += toInt(row.destroyed, 'destroyed');
        flow.transferred += toInt(row.transferred, 'transferred');
        flow.entries += toInt(row.entries, 'entries');
        flow.net = flow.created - flow.destroyed;
      }
      return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    },
  };
}
