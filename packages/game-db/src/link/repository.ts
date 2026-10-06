/**
 * Le lien site → serveur : battements des serveurs et intentions.
 *
 * Le dépôt des intentions est la SEULE écriture de tout le package, et il ne fait qu'insérer :
 * le site n'a que le droit d'ajouter une ligne à `link_intents`, le serveur fait le reste.
 */
import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely';
import { z } from 'zod';

import { InvalidIntentError, LinkUnavailableError } from '../errors';
import type { DbContext } from '../internal/context';
import {
  formatIssue,
  identifierSchema,
  parseInput,
  timeRangeShape,
  uuidSchema,
} from '../internal/input';
import { toInt, toTextOrNull } from '../internal/numbers';
import { serializeIntentPayload, type IntentKind, type IntentPayloads } from '../intents/kinds';
import { signIntent } from '../intents/signature';
import { emptyPage, offsetOf, pageShape, toPage, type Page, type PageInput } from '../pagination';
import type { Database, LinkIntentsTable } from '../schema';
import { DEFAULT_INTENT_TTL_MS, MIN_LINK_SECRET_BYTES, SERVER_ONLINE_WINDOW_MS } from './constants';

export const INTENT_STATUSES = [
  'pending',
  'running',
  'done',
  'refused',
  'failed',
  'expired',
] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export interface ServerHeartbeat {
  serverId: string;
  /** Démarrage du plugin. */
  startedAt: number;
  /** Dernier battement. */
  seenAt: number;
  /** Vrai si le dernier battement date de moins de 45 secondes. */
  online: boolean;
  pluginVersion: string;
  minecraftVersion: string;
  onlinePlayers: number;
  maxPlayers: number;
  /** TPS sur une minute (20 = nominal). */
  tps: number;
  /** Durée moyenne d'un tick, en millisecondes. */
  mspt: number;
}

export interface Intent {
  id: string;
  idempotencyKey: string;
  /** Type d'action ; une action d'une version plus récente du contrat reste lisible. */
  kind: string;
  /** Le `payload` décodé, `null` s'il n'est pas du JSON lisible. */
  payload: unknown;
  /** La chaîne exacte écrite en base, celle qui est signée. */
  payloadText: string;
  /** Serveur destinataire, `null` pour n'importe lequel. */
  targetServer: string | null;
  /** Sujet Ascencia ID de l'auteur. */
  actorId: string;
  actorName: string;
  /** UUID Minecraft lié à l'auteur, `null` sinon. */
  actorUuid: string | null;
  reason: string;
  status: IntentStatus;
  createdAt: number;
  expiresAt: number;
  /**
   * Vrai si l'intention ne sera plus exécutée faute d'avoir été prise à temps : marquée `expired`,
   * ou encore `pending` après `expiresAt` (le serveur ne l'a pas encore constaté, ou il est éteint).
   */
  expired: boolean;
  claimedAt: number | null;
  claimedBy: string | null;
  finishedAt: number | null;
  /** Code machine du résultat (`ok`, `unknown_group`, `bad_signature`…), `null` tant que non finie. */
  resultCode: string | null;
  /** Détail du résultat décodé, `null` s'il est absent ou illisible. */
  resultDetail: unknown;
  signature: string;
}

export interface IntentListInput extends PageInput {
  status?: IntentStatus | undefined;
  actorId?: string | undefined;
  kind?: string | undefined;
  from?: number | undefined;
  to?: number | undefined;
}

/** Ce qui entoure l'action : qui la demande, pourquoi, et sa clé d'idempotence. */
export interface IntentEnvelope {
  /** Clé unique de la demande (64 caractères au plus) : déposée deux fois, elle n'existe qu'une fois. */
  idempotencyKey: string;
  /** Sujet Ascencia ID de l'auteur (`sub`). */
  actorId: string;
  /** Nom affiché de l'auteur au moment du dépôt. */
  actorName: string;
  /** UUID Minecraft lié à l'auteur, s'il en a un. */
  actorUuid?: string | null | undefined;
  /** Motif, sur une seule ligne, obligatoire. */
  reason: string;
  /** Serveur destinataire ; absent : n'importe lequel. */
  targetServer?: string | null | undefined;
  /** Durée de validité. Défaut : 10 minutes. */
  ttlMs?: number | undefined;
}

/** Une demande d'action : `payload` est typé d'après `kind`. */
export type EnqueueIntentInput = {
  [K in IntentKind]: IntentEnvelope & { kind: K; payload: IntentPayloads[K] };
}[IntentKind];

export interface EnqueueIntentOptions {
  /** Secret partagé ; à défaut, celui de `createGameDb` puis `ENDERIUM_LINK_SECRET`. */
  secret?: string | undefined;
}

export interface EnqueueIntentResult {
  intent: Intent;
  /** Faux si la clé d'idempotence existait déjà : `intent` est alors l'intention d'origine. */
  created: boolean;
  /**
   * Quand `created` est faux : vrai si l'intention d'origine porte la même action, le même
   * `payload` et le même auteur. Faux signale une clé réutilisée pour une autre demande.
   */
  sameRequest: boolean;
}

/** Pourquoi le lien peut, ou ne peut pas, recevoir une action. */
export interface LinkStatus {
  /** Les tables `link_*` existent. */
  tables: boolean;
  secret: 'ok' | 'missing' | 'too-short';
  /** Vrai si `intents.enqueue` peut être appelé. */
  canEnqueue: boolean;
}

export interface LinkRepository {
  /** Vrai si les tables du lien existent (le plugin EnderiumLink est installé). */
  available(): Promise<boolean>;
  status(options?: EnqueueIntentOptions): Promise<LinkStatus>;
  /** Les serveurs connus, avec `online` calculé. Vide si le lien est absent. */
  servers(): Promise<ServerHeartbeat[]>;
  intents: {
    /** Le journal des actions de l'équipe, de la plus récente à la plus ancienne. */
    list(input?: IntentListInput): Promise<Page<Intent>>;
    get(id: string): Promise<Intent | null>;
    /**
     * Dépose une intention signée. Lève {@link LinkUnavailableError} sans table ou sans secret,
     * {@link InvalidIntentError} si la demande est invalide. Idempotent sur `idempotencyKey`.
     */
    enqueue(
      input: EnqueueIntentInput,
      options?: EnqueueIntentOptions,
    ): Promise<EnqueueIntentResult>;
  };
}

/** Une ligne, sans retour à la ligne ni autre caractère de contrôle : le découpage du message signé en dépend. */
const SINGLE_LINE = /^[^\p{Cc}\p{Zl}\p{Zp}]*$/u;
const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(SINGLE_LINE, 'Une seule ligne, sans caractère de contrôle');

const envelopeSchema = z.object({
  idempotencyKey: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[\x21-\x7e]+$/, 'Caractères ASCII imprimables, sans espace'),
  actorId: singleLine(64),
  actorName: singleLine(64),
  actorUuid: uuidSchema
    .or(z.literal(''))
    .nullish()
    .transform((value) => value ?? ''),
  reason: singleLine(255),
  targetServer: z
    .string()
    .max(32)
    .regex(/^[A-Za-z0-9_.-]*$/, 'Identifiant de serveur invalide')
    .nullish()
    .transform((value) => value ?? ''),
  ttlMs: z
    .number()
    .int()
    .min(1_000)
    .max(24 * 60 * 60 * 1000)
    .default(DEFAULT_INTENT_TTL_MS),
});

const listSchema = z.object({
  ...pageShape,
  ...timeRangeShape,
  status: z.enum(INTENT_STATUSES).optional(),
  actorId: identifierSchema(64).optional(),
  kind: identifierSchema(48).optional(),
});

const INTENT_COLUMNS = [
  'id',
  'idempotency_key',
  'kind',
  'payload',
  'target_server',
  'actor_id',
  'actor_name',
  'actor_uuid',
  'reason',
  'status',
  'created_at',
  'expires_at',
  'claimed_at',
  'claimed_by',
  'finished_at',
  'result_code',
  'result_detail',
  'signature',
] as const;

function parseJson(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const zeroAsNull = (value: number) => (value === 0 ? null : value);

function toIntent(row: LinkIntentsTable, now: number): Intent {
  const status = row.status as IntentStatus;
  const expiresAt = toInt(row.expires_at, 'expires_at');
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    kind: row.kind,
    payload: parseJson(row.payload),
    payloadText: row.payload,
    targetServer: toTextOrNull(row.target_server),
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorUuid: toTextOrNull(row.actor_uuid),
    reason: row.reason,
    status,
    createdAt: toInt(row.created_at, 'created_at'),
    expiresAt,
    expired: status === 'expired' || (status === 'pending' && expiresAt <= now),
    claimedAt: zeroAsNull(toInt(row.claimed_at, 'claimed_at')),
    claimedBy: toTextOrNull(row.claimed_by),
    finishedAt: zeroAsNull(toInt(row.finished_at, 'finished_at')),
    resultCode: toTextOrNull(row.result_code),
    resultDetail: parseJson(row.result_detail),
    signature: row.signature,
  };
}

function secretState(secret: string | undefined): LinkStatus['secret'] {
  if (secret === undefined || secret === '') return 'missing';
  return Buffer.byteLength(secret, 'utf8') < MIN_LINK_SECRET_BYTES ? 'too-short' : 'ok';
}

export function createLinkRepository(ctx: DbContext): LinkRepository {
  const available = () => ctx.catalog.has('link_intents', 'link_servers');
  const resolveSecret = (options?: EnqueueIntentOptions) => options?.secret ?? ctx.linkSecret();

  function findByKey(db: Kysely<Database>, idempotencyKey: string) {
    return db
      .selectFrom('link_intents')
      .select(INTENT_COLUMNS)
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();
  }

  return {
    available,

    async status(options) {
      const tables = await available();
      const secret = secretState(resolveSecret(options));
      return { tables, secret, canEnqueue: tables && secret === 'ok' };
    },

    async servers() {
      if (!(await ctx.catalog.has('link_servers'))) return [];
      const rows = await ctx.db
        .selectFrom('link_servers')
        .select([
          'server_id',
          'started_at',
          'seen_at',
          'plugin_version',
          'minecraft_version',
          'online_players',
          'max_players',
          'tps_centi',
          'mspt_centi',
        ])
        .orderBy('server_id')
        .execute();
      const now = ctx.now();
      return rows.map((row) => {
        const seenAt = toInt(row.seen_at, 'seen_at');
        return {
          serverId: row.server_id,
          startedAt: toInt(row.started_at, 'started_at'),
          seenAt,
          online: now - seenAt < SERVER_ONLINE_WINDOW_MS,
          pluginVersion: row.plugin_version,
          minecraftVersion: row.minecraft_version,
          onlinePlayers: toInt(row.online_players, 'online_players'),
          maxPlayers: toInt(row.max_players, 'max_players'),
          tps: toInt(row.tps_centi, 'tps_centi') / 100,
          mspt: toInt(row.mspt_centi, 'mspt_centi') / 100,
        };
      });
    },

    intents: {
      async list(input = {}) {
        const query = parseInput(listSchema, input, 'Filtre des intentions invalide');
        if (!(await ctx.catalog.has('link_intents'))) return emptyPage(query);

        const { status, actorId, kind, from, to } = query;
        const filtered = ctx.db
          .selectFrom('link_intents')
          .$if(status !== undefined, (qb) => qb.where('status', '=', status as string))
          .$if(actorId !== undefined, (qb) => qb.where('actor_id', '=', actorId as string))
          .$if(kind !== undefined, (qb) => qb.where('kind', '=', kind as string))
          .$if(from !== undefined, (qb) => qb.where('created_at', '>=', from as number))
          .$if(to !== undefined, (qb) => qb.where('created_at', '<', to as number));

        const [rows, counted] = await Promise.all([
          filtered
            .select(INTENT_COLUMNS)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(query.pageSize)
            .offset(offsetOf(query))
            .execute(),
          filtered.select((eb) => eb.fn.countAll().as('total')).executeTakeFirstOrThrow(),
        ]);
        const now = ctx.now();
        return toPage(
          rows.map((row) => toIntent(row, now)),
          toInt(counted.total, 'total'),
          query,
        );
      },

      async get(id) {
        const intentId = parseInput(uuidSchema, id, "Identifiant d'intention invalide");
        if (!(await ctx.catalog.has('link_intents'))) return null;
        const row = await ctx.db
          .selectFrom('link_intents')
          .select(INTENT_COLUMNS)
          .where('id', '=', intentId)
          .executeTakeFirst();
        return row === undefined ? null : toIntent(row, ctx.now());
      },

      async enqueue(input, options) {
        // 1. La demande est-elle bien formée ? Aucun accès à la base avant cette réponse.
        const envelope = envelopeSchema.safeParse(input);
        if (!envelope.success) {
          const issues = envelope.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          }));
          throw new InvalidIntentError(
            `Intention invalide : ${issues.map(formatIssue).join(' ; ')}`,
            issues,
          );
        }
        const { kind } = input;
        const { json } = serializeIntentPayload(kind, input.payload);
        const request = envelope.data;

        // 2. Le lien peut-il la recevoir ?
        const secret = resolveSecret(options);
        const state = secretState(secret);
        if (state === 'missing' || secret === undefined)
          throw new LinkUnavailableError('secret-missing');
        if (state === 'too-short') throw new LinkUnavailableError('secret-too-short');
        if (!(await available())) throw new LinkUnavailableError('tables-missing');

        const asExisting = (row: LinkIntentsTable): EnqueueIntentResult => ({
          intent: toIntent(row, ctx.now()),
          created: false,
          sameRequest:
            row.kind === kind && row.payload === json && row.actor_id === request.actorId,
        });

        // 3. Déjà déposée ? On rend l'intention d'origine, sans rien écrire.
        const existing = await findByKey(ctx.db, request.idempotencyKey);
        if (existing !== undefined) return asExisting(existing);

        // 4. Signature puis insertion : c'est la seule écriture du package.
        const createdAt = ctx.now();
        const expiresAt = createdAt + request.ttlMs;
        const id = randomUUID();
        const row: LinkIntentsTable = {
          id,
          idempotency_key: request.idempotencyKey,
          kind,
          payload: json,
          target_server: request.targetServer,
          actor_id: request.actorId,
          actor_name: request.actorName,
          actor_uuid: request.actorUuid,
          reason: request.reason,
          status: 'pending',
          created_at: createdAt,
          expires_at: expiresAt,
          claimed_at: 0,
          claimed_by: '',
          finished_at: 0,
          result_code: '',
          result_detail: '',
          signature: signIntent(
            {
              id,
              idempotencyKey: request.idempotencyKey,
              kind,
              targetServer: request.targetServer,
              actorId: request.actorId,
              actorUuid: request.actorUuid,
              createdAt,
              expiresAt,
              reason: request.reason,
              payload: json,
            },
            secret,
          ),
        };

        return ctx.withWriter(async (writer) => {
          try {
            await writer.insertInto('link_intents').values(row).execute();
          } catch (error) {
            // Deux dépôts simultanés de la même clé : la contrainte d'unicité a tranché, on rend
            // l'intention gagnante. Toute autre erreur remonte telle quelle.
            const winner = await findByKey(writer, request.idempotencyKey);
            if (winner === undefined) throw error;
            return asExisting(winner);
          }
          return { intent: toIntent(row, createdAt), created: true, sameRequest: true };
        });
      },
    },
  };
}
