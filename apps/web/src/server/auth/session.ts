/**
 * La session de la console : un cookie chiffré, sans magasin côté serveur.
 *
 * Le contenu est un JWE (`dir` + `A256GCM`, via `jose`) dont la clé est dérivée
 * de `SESSION_SECRET` par HKDF. Chiffré **et** authentifié : le navigateur ne
 * peut ni lire le contenu, ni en changer un octet sans que l'ouverture échoue.
 *
 * Ce module ne dépend ni de Next ni de l'environnement : tout lui est passé en
 * argument, il se teste tel quel.
 */

import { EncryptJWT, jwtDecrypt } from 'jose';
import { z } from 'zod';
import { CONSOLE_PERMISSIONS, type ConsolePermission } from './permissions';

// ── Durées (secondes) ────────────────────────────────────────────────────────

/** Durée maximale d'une session depuis la connexion, quoi qu'il arrive. */
export const SESSION_ABSOLUTE_TTL = 8 * 60 * 60;
/** Durée d'inactivité tolérée. Repoussée à chaque renouvellement des droits. */
export const SESSION_IDLE_TTL = 2 * 60 * 60;
/** Âge à partir duquel le proxy redemande les droits à Ascencia ID. */
export const RIGHTS_REFRESH_AFTER = 5 * 60;
/** Âge au-delà duquel une session n'est plus acceptée du tout tant qu'elle n'est pas revérifiée. */
export const RIGHTS_MAX_AGE = 15 * 60;
/** Âge maximal des droits pour une requête qui modifie quelque chose (POST, action serveur). */
export const MUTATION_RIGHTS_MAX_AGE = 60;
/** Durée de vie de la transaction de connexion (state, nonce, PKCE). */
export const TRANSACTION_TTL = 10 * 60;

/** Un cookie au-delà de cette taille est refusé par les navigateurs (limite : 4096 octets, nom compris). */
export const COOKIE_VALUE_MAX_LENGTH = 3800;

// ── Formes ───────────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  /** Identifiant de compte Ascencia ID (`sub`). */
  sub: z.string().min(1).max(128),
  name: z.string().min(1).max(80),
  avatar: z.string().max(512).nullable(),
  minecraftUuid: z.string().max(36).nullable(),
  roles: z.array(z.string().max(64)).max(32),
  permissions: z.array(z.enum(CONSOLE_PERMISSIONS)),
  /** Instant de la connexion. */
  startedAt: z.number().int().positive(),
  /** Fin par inactivité ; glisse, sans jamais dépasser `absoluteExpiresAt`. */
  expiresAt: z.number().int().positive(),
  absoluteExpiresAt: z.number().int().positive(),
  /** Dernière fois où Ascencia ID a confirmé les droits. */
  checkedAt: z.number().int().positive(),
  /** Session SSO chez Ascencia ID. */
  sid: z.string().max(128).optional(),
  /** Jeton de renouvellement. Ne quitte jamais le serveur autrement que chiffré ici. */
  refreshToken: z.string().max(512).optional(),
  /** Gardé pour la déconnexion chez le fournisseur (`id_token_hint`). */
  idToken: z.string().max(2048).optional(),
  /** Session du mode développement. */
  dev: z.literal(true).optional(),
});

export type SessionPayload = z.infer<typeof sessionSchema>;

const transactionSchema = z.object({
  state: z.string().min(16).max(256),
  nonce: z.string().min(16).max(256),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().max(512),
  returnTo: z.string().max(2048),
  createdAt: z.number().int().positive(),
});

export type SignInTransaction = z.infer<typeof transactionSchema>;

/** Ce que les pages reçoivent. La forme est un contrat : d'autres l'appellent. */
export interface ConsoleUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  minecraftUuid: string | null;
  roles: readonly string[];
  permissions: ReadonlySet<ConsolePermission>;
}

// ── Clés ─────────────────────────────────────────────────────────────────────

type Purpose = 'session' | 'sign-in-transaction';

const HKDF_SALT = new TextEncoder().encode('enderium-web/auth/v1');
const derivedKeys = new Map<string, Promise<Uint8Array>>();

/**
 * Une clé par usage : un cookie de transaction ne peut pas être présenté
 * comme une session, même s'il sort du même secret.
 */
function deriveKey(secret: string, purpose: Purpose): Promise<Uint8Array> {
  const cacheKey = `${purpose}\u0000${secret}`;
  let key = derivedKeys.get(cacheKey);
  if (!key) {
    key = (async () => {
      const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        'HKDF',
        false,
        ['deriveBits'],
      );
      const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new TextEncoder().encode(purpose) },
        material,
        256,
      );
      return new Uint8Array(bits);
    })();
    derivedKeys.set(cacheKey, key);
  }
  return key;
}

async function seal(
  payload: Record<string, unknown>,
  secret: string,
  purpose: Purpose,
  issuedAt: number,
  expiresAt: number,
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setAudience(purpose)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .encrypt(await deriveKey(secret, purpose));
}

async function open(
  token: string,
  secret: string,
  purpose: Purpose,
  now: number,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtDecrypt(token, await deriveKey(secret, purpose), {
      audience: purpose,
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
      currentDate: new Date(now * 1000),
      clockTolerance: 0,
      requiredClaims: ['exp', 'iat', 'aud'],
    });
    return payload;
  } catch {
    // Altéré, périmé, chiffré avec un autre secret : même réponse. Le détail
    // n'intéresse personne, et surtout pas celui qui a trafiqué le cookie.
    return null;
  }
}

// ── Session ──────────────────────────────────────────────────────────────────

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Chiffre la session. Si le résultat dépasse ce qu'un cookie accepte, le
 * jeton d'identité est abandonné : il ne sert qu'à la déconnexion chez le
 * fournisseur, qui demandera alors une confirmation.
 */
export async function sealSession(payload: SessionPayload, secret: string): Promise<string> {
  const parsed = sessionSchema.parse(payload);
  const sealed = await seal(parsed, secret, 'session', parsed.checkedAt, parsed.expiresAt);
  if (sealed.length <= COOKIE_VALUE_MAX_LENGTH) return sealed;
  if (parsed.idToken === undefined) throw new Error('La session ne tient pas dans un cookie.');

  const lighter = { ...parsed };
  delete lighter.idToken;
  return sealSession(lighter, secret);
}

/** `null` pour tout cookie qui n'est pas une session valide et non périmée. */
export async function openSession(
  token: string | null | undefined,
  secret: string,
  now: number = nowInSeconds(),
): Promise<SessionPayload | null> {
  if (!token || token.length > COOKIE_VALUE_MAX_LENGTH) return null;
  const raw = await open(token, secret, 'session', now);
  if (!raw) return null;

  const parsed = sessionSchema.safeParse(raw);
  if (!parsed.success) return null;

  const session = parsed.data;
  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) return null;
  if (session.expiresAt > session.absoluteExpiresAt) return null;
  if (session.absoluteExpiresAt - session.startedAt > SESSION_ABSOLUTE_TTL) return null;
  return session;
}

export type SessionStanding =
  /** Utilisable telle quelle. */
  | 'fresh'
  /** Encore acceptée, mais les droits doivent être redemandés. */
  | 'refresh-due'
  /** Droits trop anciens : refusée tant qu'elle n'est pas revérifiée. */
  | 'stale'
  /** Session de développement alors que le mode est fermé. */
  | 'rejected';

/**
 * Où en est la session vis-à-vis de la fraîcheur de ses droits.
 * `maxAge` se resserre pour les requêtes qui modifient quelque chose.
 */
export function sessionStanding(
  session: SessionPayload,
  options: { now: number; devAuth: boolean; maxAge?: number },
): SessionStanding {
  if (session.dev) return options.devAuth ? 'fresh' : 'rejected';

  const age = options.now - session.checkedAt;
  if (age > (options.maxAge ?? RIGHTS_MAX_AGE)) return 'stale';
  if (age > RIGHTS_REFRESH_AFTER) return 'refresh-due';
  return 'fresh';
}

export function toConsoleUser(session: SessionPayload): ConsoleUser {
  return {
    id: session.sub,
    displayName: session.name,
    avatarUrl: session.avatar,
    minecraftUuid: session.minecraftUuid,
    roles: Object.freeze([...session.roles]),
    permissions: new Set(session.permissions),
  };
}

// ── Transaction de connexion ─────────────────────────────────────────────────

export async function sealTransaction(
  transaction: SignInTransaction,
  secret: string,
): Promise<string> {
  const parsed = transactionSchema.parse(transaction);
  return seal(
    parsed,
    secret,
    'sign-in-transaction',
    parsed.createdAt,
    parsed.createdAt + TRANSACTION_TTL,
  );
}

export async function openTransaction(
  token: string | null | undefined,
  secret: string,
  now: number = nowInSeconds(),
): Promise<SignInTransaction | null> {
  if (!token || token.length > COOKIE_VALUE_MAX_LENGTH) return null;
  const raw = await open(token, secret, 'sign-in-transaction', now);
  if (!raw) return null;
  const parsed = transactionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
