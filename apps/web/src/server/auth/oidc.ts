/**
 * Le parcours OpenID Connect avec Ascencia ID, côté serveur.
 *
 * Tout ce qui est protocole vient des SDK publiés : `AscenciaClient`
 * (`@ascencia/id-core`) fabrique l'URL d'autorisation, échange le code et
 * renouvelle les jetons ; `createVerifier` (`@ascencia/id-server`) vérifie le
 * jeton d'accès contre le JWKS. Ce fichier y ajoute la vérification du jeton
 * d'identité (signature, émetteur, audience, `nonce`) et la traduction des
 * revendications en droits de la console.
 *
 * Le réseau, les clés et l'horloge sont injectables : les tests branchent un
 * faux fournisseur.
 */

import {
  AscenciaClient,
  AscenciaError,
  type DiscoveryDocument,
  type FetchLike,
  type Tokens,
  memoryStorage,
  normalizeIssuer,
} from '@ascencia/id-core';
import {
  ALLOWED_ALGORITHMS,
  AscenciaAuthError,
  type AscenciaContext,
  createVerifier,
  timingSafeEqual,
} from '@ascencia/id-server';
import { type JWTVerifyGetKey, jwtVerify } from 'jose';
import type { AscenciaSettings } from './config';
import { SignInError } from './errors';
import { type ConsolePermission, resolveConsolePermissions } from './permissions';
import type { SignInTransaction } from './session';

/**
 * `offline_access` fait émettre le jeton de renouvellement ; `ascencia.roles`
 * et `ascencia.perms` font entrer les rôles et les permissions dans le jeton
 * d'accès. Le défaut du SDK publié n'inclut pas `ascencia.perms` : on ne s'en
 * remet donc pas à lui. L'adresse e-mail n'est pas demandée, la console n'en
 * a pas l'usage.
 */
export const OIDC_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'ascencia.roles',
  'ascencia.perms',
] as const;

const REQUEST_TIMEOUT_MS = 8_000;
const CLOCK_TOLERANCE_SECONDS = 5;
const NAME_MAX_LENGTH = 80;
const FALLBACK_NAME = 'Membre de l’équipe';
const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export interface OidcDependencies {
  fetch?: FetchLike;
  /** Résolveur de clés déjà construit (tests). Sinon : le JWKS de l'émetteur. */
  keyResolver?: JWTVerifyGetKey;
  /** Document de découverte fourni à la main (tests). */
  metadata?: DiscoveryDocument;
  /** Horloge en secondes. */
  now?: () => number;
}

export interface ProviderProfile {
  name: string | null;
  avatar: string | null;
}

/** Ce qu'une connexion ou un renouvellement réussi apprend sur le compte. */
export interface ProviderGrant {
  sub: string;
  sid: string | null;
  roles: string[];
  permissions: ConsolePermission[];
  minecraftUuid: string | null;
  /** `null` si le profil n'a pas pu être lu : l'appelant garde l'ancien. */
  profile: ProviderProfile | null;
  refreshToken: string | null;
  idToken: string | null;
}

export type RefreshOutcome =
  | { kind: 'renewed'; grant: ProviderGrant }
  /**
   * Le fournisseur a bien tourné le jeton, mais la suite a échoué (clés
   * injoignables). Le nouveau jeton doit être gardé – l'ancien est consommé –
   * sans que les droits soient considérés comme revérifiés.
   */
  | { kind: 'rotated'; refreshToken: string | null }
  /** Refus net : jeton révoqué, compte banni, accès retiré. La session est finie. */
  | { kind: 'rejected' }
  /** Fournisseur injoignable : rien n'a changé, on réessaiera. */
  | { kind: 'unavailable' };

export interface OidcFlow {
  beginSignIn(options: {
    returnTo: string;
    prompt?: 'none' | 'login' | 'select_account';
  }): Promise<{ authorizeUrl: string; transaction: SignInTransaction }>;
  completeSignIn(params: URLSearchParams, transaction: SignInTransaction): Promise<ProviderGrant>;
  refresh(refreshToken: string): Promise<RefreshOutcome>;
  revoke(refreshToken: string): Promise<void>;
  endSessionUrl(options: {
    idToken: string | null;
    postLogoutRedirectUri: string;
  }): Promise<string>;
}

export function createOidcFlow(settings: AscenciaSettings, deps: OidcDependencies = {}): OidcFlow {
  const issuer = normalizeIssuer(settings.issuer);
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  const baseFetch: FetchLike = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  /**
   * Délai borné, et aucune redirection suivie : une requête qui porte le
   * secret du client ou un jeton ne doit pas être rejouée vers une autre
   * adresse parce qu'un intermédiaire l'a demandé.
   */
  const guardedFetch: FetchLike = (input, init) =>
    baseFetch(input, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  const verifier = createVerifier({
    issuer,
    audience: settings.clientId,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    ...(deps.keyResolver ? { keyResolver: deps.keyResolver } : {}),
    ...(deps.metadata?.jwks_uri ? { jwksUri: deps.metadata.jwks_uri } : {}),
  });

  /**
   * Un client par opération. `AscenciaClient` garde les jetons dans son
   * instance : c'est juste pour un navigateur, où il n'y a qu'une personne,
   * et faux pour un serveur partagé. Une instance jetable ne mélange rien.
   */
  function newClient(refreshToken?: string): AscenciaClient {
    return new AscenciaClient({
      issuer,
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      redirectUri: settings.redirectUri,
      scopes: OIDC_SCOPES,
      fetch: guardedFetch,
      // Le seul jeton que le client relit dans son stockage est le jeton de
      // renouvellement : on lui tend celui de la session en cours.
      storage: refreshToken
        ? { get: () => refreshToken, set: () => undefined, remove: () => undefined }
        : memoryStorage(),
      transactionStorage: memoryStorage(),
      ...(deps.metadata ? { metadata: deps.metadata } : {}),
    });
  }

  async function readProfile(client: AscenciaClient): Promise<ProviderProfile | null> {
    try {
      const user = await client.getUser({ force: true });
      if (!user) return null;
      return {
        name: cleanName(user.display_name) ?? cleanName(user.username),
        avatar: safeAvatarUrl(user.avatar_url),
      };
    } catch {
      return null;
    }
  }

  /** Vérifie le jeton d'identité : signature, émetteur, audience, échéance, `nonce`. */
  async function verifyIdToken(idToken: string, nonce: string): Promise<Record<string, unknown>> {
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(idToken, verifier.keys, {
        issuer,
        audience: settings.clientId,
        algorithms: [...ALLOWED_ALGORITHMS],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: new Date(now() * 1000),
        requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'nonce'],
      }));
    } catch (cause) {
      throw new SignInError('invalid_token', { cause });
    }

    // Le `nonce` lie ce jeton à la demande partie de ce navigateur : sans lui,
    // un jeton d'identité valide volé ailleurs pourrait être rejoué ici.
    if (typeof payload.nonce !== 'string' || !timingSafeEqual(nonce, payload.nonce)) {
      throw new SignInError('invalid_token');
    }
    // Plusieurs audiences : le client autorisé doit être celui-ci (OIDC Core §3.1.3.7).
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== settings.clientId) {
      throw new SignInError('invalid_token');
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new SignInError('invalid_token');
    }
    return payload;
  }

  return {
    async beginSignIn({ returnTo, prompt }) {
      let request;
      try {
        request = await newClient().buildAuthorizeUrl(prompt ? { prompt } : {});
      } catch (cause) {
        throw new SignInError('provider_unavailable', { cause });
      }
      return {
        authorizeUrl: request.url,
        transaction: {
          state: request.state,
          nonce: request.nonce,
          codeVerifier: request.codeVerifier,
          redirectUri: request.redirectUri,
          returnTo,
          createdAt: now(),
        },
      };
    },

    async completeSignIn(params, transaction) {
      // Le `state` d'abord, avant de croire quoi que ce soit d'autre dans
      // l'URL : c'est lui qui prouve que ce retour répond à une demande partie
      // de ce navigateur (CSRF sur le retour d'autorisation).
      const state = params.get('state');
      if (!state || !timingSafeEqual(transaction.state, state)) {
        throw new SignInError('invalid_state');
      }

      // RFC 9207 : quand le fournisseur signe son retour d'un `iss`, il doit
      // être le nôtre (attaque par confusion de fournisseur).
      const returnedIssuer = params.get('iss');
      if (returnedIssuer !== null && normalizeIssuer(returnedIssuer) !== issuer) {
        throw new SignInError('invalid_state');
      }

      const providerError = params.get('error');
      if (providerError) {
        if (providerError === 'access_denied') throw new SignInError('access_denied');
        if (
          providerError === 'login_required' ||
          providerError === 'interaction_required' ||
          providerError === 'consent_required'
        ) {
          throw new SignInError('login_required');
        }
        throw new SignInError('provider_error');
      }

      const code = params.get('code');
      if (!code) throw new SignInError('exchange_failed');

      const client = newClient();
      let tokens: Tokens;
      try {
        tokens = await client.exchangeCode(code, transaction.codeVerifier, transaction.redirectUri);
      } catch (cause) {
        if (cause instanceof AscenciaError && cause.code === 'access_denied') {
          throw new SignInError('access_denied', { cause });
        }
        throw new SignInError(
          isNetworkFailure(cause) ? 'provider_unavailable' : 'exchange_failed',
          {
            cause,
          },
        );
      }

      if (!tokens.idToken) throw new SignInError('invalid_token');
      const identity = await verifyIdToken(tokens.idToken, transaction.nonce);

      let access: AscenciaContext;
      try {
        access = await verifier(tokens.accessToken);
      } catch (cause) {
        throw new SignInError('invalid_token', { cause });
      }
      // Les deux jetons doivent parler de la même personne.
      if (access.subject !== identity.sub) throw new SignInError('invalid_token');

      const rights = readRights(access);
      return {
        ...rights,
        minecraftUuid: rights.minecraftUuid ?? readMinecraftUuid(identity),
        profile: await readProfile(client),
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
      };
    },

    async refresh(refreshToken) {
      const client = newClient(refreshToken);

      let tokens: Tokens;
      try {
        tokens = await client.refresh();
      } catch (cause) {
        return { kind: isRejection(cause) ? 'rejected' : 'unavailable' };
      }

      let access: AscenciaContext;
      try {
        access = await verifier(tokens.accessToken);
      } catch (cause) {
        // Clés injoignables : le jeton a tourné, on ne peut juste pas le lire
        // maintenant. Toute autre cause est un jeton qu'on refuse.
        return isKeyFetchFailure(cause)
          ? { kind: 'rotated', refreshToken: tokens.refreshToken }
          : { kind: 'rejected' };
      }

      let rights;
      try {
        rights = readRights(access);
      } catch {
        return { kind: 'rejected' };
      }

      return {
        kind: 'renewed',
        grant: {
          ...rights,
          profile: await readProfile(client),
          refreshToken: tokens.refreshToken,
          idToken: tokens.idToken,
        },
      };
    },

    async revoke(refreshToken) {
      try {
        const metadata = await newClient().metadata();
        const endpoint = metadata.revocation_endpoint ?? `${issuer}/oauth/revoke`;
        await guardedFetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body: new URLSearchParams({
            token: refreshToken,
            token_type_hint: 'refresh_token',
            client_id: settings.clientId,
            client_secret: settings.clientSecret,
          }).toString(),
        });
      } catch {
        // Au mieux : la session locale est détruite de toute façon, et le
        // jeton meurt de lui-même à son échéance.
      }
    },

    async endSessionUrl({ idToken, postLogoutRedirectUri }) {
      let endpoint = `${issuer}/oauth/logout`;
      try {
        endpoint = (await newClient().metadata()).end_session_endpoint ?? endpoint;
      } catch {
        // Découverte injoignable : l'adresse documentée fait l'affaire.
      }
      const url = new URL(endpoint);
      if (idToken) url.searchParams.set('id_token_hint', idToken);
      url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
      return url.toString();
    },
  };
}

// ── Lecture des revendications ───────────────────────────────────────────────

type Rights = Pick<ProviderGrant, 'sub' | 'sid' | 'roles' | 'permissions' | 'minecraftUuid'>;

/**
 * Traduit un jeton d'accès **déjà vérifié** en droits de la console.
 * Lève une `SignInError` quand le jeton ne doit pas ouvrir de session.
 */
export function readRights(access: AscenciaContext): Rights {
  const claims = access.claims;

  // Jeton de service (`client_credentials`) : il n'y a personne derrière.
  if (claims.token_use === 'service') throw new SignInError('access_denied');

  // Session d'assistance ouverte par un administrateur d'Ascencia ID au nom
  // de quelqu'un d'autre : la console écrit dans un journal nominatif et
  // crédite des comptes, elle n'accepte pas d'acteur d'emprunt.
  if (access.isImpersonated()) throw new SignInError('impersonation_refused');

  const membership = access.membership;
  if (membership && membership.st !== 'active') throw new SignInError('access_denied');

  // Sans la revendication `perms` (scope refusé à l'application, ou liste
  // tronquée), on ne sait rien des droits : on n'en invente pas.
  if (!access.hasPermissionClaim || access.permissionsTruncated) {
    throw new SignInError('permissions_unavailable');
  }

  return {
    sub: access.subject,
    sid: access.sessionId,
    roles: access.roles
      .filter((role) => typeof role === 'string' && role.length <= 64)
      .slice(0, 32),
    permissions: resolveConsolePermissions({ allow: access.permissions }),
    minecraftUuid: readMinecraftUuid(claims),
  };
}

/**
 * UUID Minecraft lié au compte, si le fournisseur le transmet.
 *
 * Ascencia ID ne l'émet pas encore (liaison Minecraft prévue, non livrée) : la
 * revendication attendue est `minecraft_uuid`. Tant qu'elle manque, `null`.
 */
function readMinecraftUuid(claims: Record<string, unknown>): string | null {
  const value = claims.minecraft_uuid;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return null;
  const hex = value.replaceAll('-', '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cleanName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, NAME_MAX_LENGTH);
}

export function displayNameOrFallback(profile: ProviderProfile | null): string {
  return profile?.name ?? FALLBACK_NAME;
}

/** Une adresse d'avatar n'est gardée que si c'est une vraie URL `https` (ou locale). */
export function safeAvatarUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.href;
    if (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Classement des échecs ────────────────────────────────────────────────────

function isNetworkFailure(cause: unknown): boolean {
  if (!(cause instanceof AscenciaError)) return true;
  return cause.code === 'network_error' || (cause.status !== null && cause.status >= 500);
}

/**
 * Un renouvellement est **refusé** quand le fournisseur a répondu, et a dit
 * non. Tout le reste (réseau, 5xx, réponse illisible) est une indisponibilité.
 */
function isRejection(cause: unknown): boolean {
  if (!(cause instanceof AscenciaError)) return false;
  if (cause.code === 'no_refresh_token') return true;
  if (cause.status === null || cause.status >= 500) return false;
  return cause.code === 'invalid_grant' || cause.code === 'access_denied';
}

/** Le jeton n'a pas pu être vérifié parce que les clés n'ont pas pu être lues. */
function isKeyFetchFailure(cause: unknown): boolean {
  if (!(cause instanceof AscenciaAuthError)) return true;
  const inner = (cause.cause as { code?: unknown } | undefined)?.code;
  if (typeof inner !== 'string') return cause.code === 'invalid_token' && cause.cause !== undefined;
  // Délai dépassé, ou réponse du JWKS autre que 200 (`jose` la range sous son code générique).
  return inner === 'ERR_JWKS_TIMEOUT' || inner === 'ERR_JOSE_GENERIC';
}
