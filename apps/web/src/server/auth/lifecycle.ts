/**
 * Naissance et renouvellement d'une session : des fonctions pures qui
 * fabriquent le contenu du cookie à partir de ce qu'Ascencia ID a répondu.
 */

import { type ProviderGrant, displayNameOrFallback } from './oidc';
import { DEV_PROFILES, type DevProfileId } from './permissions';
import { SESSION_ABSOLUTE_TTL, SESSION_IDLE_TTL, type SessionPayload } from './session';

export const DEV_USER_ID = 'dev:local';
export const DEV_USER_NAME = 'Développeur local';

/** Session ouverte au retour d'Ascencia ID. */
export function startSession(grant: ProviderGrant, now: number): SessionPayload {
  const absoluteExpiresAt = now + SESSION_ABSOLUTE_TTL;
  return {
    sub: grant.sub,
    name: displayNameOrFallback(grant.profile),
    avatar: grant.profile?.avatar ?? null,
    minecraftUuid: grant.minecraftUuid,
    roles: grant.roles,
    permissions: grant.permissions,
    startedAt: now,
    expiresAt: Math.min(now + SESSION_IDLE_TTL, absoluteExpiresAt),
    absoluteExpiresAt,
    checkedAt: now,
    ...(grant.sid ? { sid: grant.sid } : {}),
    ...(grant.refreshToken ? { refreshToken: grant.refreshToken } : {}),
    ...(grant.idToken ? { idToken: grant.idToken } : {}),
  };
}

/**
 * Session après un renouvellement réussi : droits remplacés par ceux que le
 * fournisseur vient de donner, inactivité repoussée, échéance absolue
 * **inchangée**. `null` si le fournisseur répond pour un autre compte.
 */
export function renewSession(
  previous: SessionPayload,
  grant: ProviderGrant,
  now: number,
): SessionPayload | null {
  if (grant.sub !== previous.sub) return null;

  const next: SessionPayload = {
    sub: previous.sub,
    name: grant.profile?.name ?? previous.name,
    avatar: grant.profile ? grant.profile.avatar : previous.avatar,
    minecraftUuid: grant.minecraftUuid,
    roles: grant.roles,
    permissions: grant.permissions,
    startedAt: previous.startedAt,
    expiresAt: Math.min(now + SESSION_IDLE_TTL, previous.absoluteExpiresAt),
    absoluteExpiresAt: previous.absoluteExpiresAt,
    checkedAt: now,
  };
  const sid = grant.sid ?? previous.sid;
  if (sid) next.sid = sid;
  if (grant.refreshToken) next.refreshToken = grant.refreshToken;
  const idToken = grant.idToken ?? previous.idToken;
  if (idToken) next.idToken = idToken;
  return next;
}

/**
 * Le jeton de renouvellement a tourné mais les droits n'ont pas pu être
 * relus : on garde le nouveau jeton, et **rien d'autre ne bouge** – ni les
 * droits, ni la date de dernière vérification.
 */
export function keepRotatedToken(
  previous: SessionPayload,
  refreshToken: string | null,
): SessionPayload {
  const next = { ...previous };
  if (refreshToken) next.refreshToken = refreshToken;
  else delete next.refreshToken;
  return next;
}

/** Session du mode développement. Aucun jeton, aucun appel au fournisseur. */
export function startDevSession(profileId: DevProfileId, now: number): SessionPayload {
  const profile = DEV_PROFILES[profileId];
  const absoluteExpiresAt = now + SESSION_ABSOLUTE_TTL;
  return {
    sub: DEV_USER_ID,
    name: DEV_USER_NAME,
    avatar: null,
    minecraftUuid: null,
    roles: [...profile.roles],
    permissions: [...profile.permissions],
    startedAt: now,
    expiresAt: absoluteExpiresAt,
    absoluteExpiresAt,
    checkedAt: now,
    dev: true,
  };
}
