/**
 * Renouvellement des droits d'une session, protégé contre les courses.
 *
 * Ascencia ID fait **tourner** le jeton de renouvellement à chaque usage, et
 * prend le rejeu d'un jeton déjà consommé pour un vol : il révoque alors toute
 * la famille et la session SSO. Or un navigateur envoie volontiers plusieurs
 * requêtes à la fois, toutes avec le même cookie. Sans précaution, la deuxième
 * rejouerait le jeton que la première vient de consommer.
 *
 * Deux mécanismes, dans la mémoire du processus :
 *   – un seul appel au fournisseur par jeton à un instant donné ;
 *   – le résultat est gardé un court moment, pour les requêtes parties avec
 *     l'ancien cookie avant que le nouveau n'arrive au navigateur.
 *
 * Limite assumée : ceci vaut pour **un** processus. Derrière plusieurs
 * instances, il faudra un verrou partagé (voir `docs/auth.md`).
 */

import { keepRotatedToken, renewSession } from './lifecycle';
import type { OidcFlow } from './oidc';
import type { SessionPayload } from './session';

export type RefreshResult =
  | { kind: 'renewed'; session: SessionPayload }
  | { kind: 'rotated'; session: SessionPayload }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

/** Durée pendant laquelle un ancien cookie reçoit encore le résultat du renouvellement. */
export const REFRESH_GRACE_SECONDS = 120;
const MAX_REMEMBERED = 2_000;

export interface SessionRefresher {
  (session: SessionPayload): Promise<RefreshResult>;
}

export function createSessionRefresher(options: {
  flow: Pick<OidcFlow, 'refresh'>;
  now: () => number;
  graceSeconds?: number;
}): SessionRefresher {
  const grace = options.graceSeconds ?? REFRESH_GRACE_SECONDS;
  const inFlight = new Map<string, Promise<RefreshResult>>();
  const remembered = new Map<string, { result: RefreshResult; until: number }>();

  function prune(now: number): void {
    for (const [key, entry] of remembered) {
      if (entry.until <= now) remembered.delete(key);
    }
    // Encore plein d'entrées valides : on vide plutôt que de grossir sans borne.
    if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  }

  async function run(session: SessionPayload, refreshToken: string): Promise<RefreshResult> {
    const outcome = await options.flow.refresh(refreshToken);
    switch (outcome.kind) {
      case 'renewed': {
        const renewed = renewSession(session, outcome.grant, options.now());
        return renewed ? { kind: 'renewed', session: renewed } : { kind: 'rejected' };
      }
      case 'rotated':
        return { kind: 'rotated', session: keepRotatedToken(session, outcome.refreshToken) };
      default:
        return outcome;
    }
  }

  return async function refresh(session) {
    const refreshToken = session.refreshToken;
    if (!refreshToken) return { kind: 'unavailable' };

    // La clé est une empreinte : l'ancien jeton ne traîne pas en clair comme
    // clé d'une table.
    const key = await fingerprint(refreshToken);
    const now = options.now();

    const known = remembered.get(key);
    if (known && known.until > now) return known.result;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const attempt = run(session, refreshToken)
      .catch((): RefreshResult => ({ kind: 'unavailable' }))
      .then((result) => {
        // Une indisponibilité n'est pas retenue : le jeton n'a pas été
        // consommé, la requête suivante doit pouvoir réessayer.
        if (result.kind !== 'unavailable') {
          prune(options.now());
          remembered.set(key, { result, until: options.now() + grace });
        }
        return result;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, attempt);
    return attempt;
  };
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
