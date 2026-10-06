/**
 * La décision du proxy pour une requête : laisser passer, renvoyer vers la
 * connexion, ou refuser. C'est aussi ici que les droits sont redemandés à
 * Ascencia ID, parce que le proxy est le seul endroit qui voit **toutes** les
 * requêtes et peut réécrire le cookie avant que la page ne soit rendue (un
 * composant serveur ne peut pas poser de cookie).
 *
 * Fonction sans dépendance à Next : `src/proxy.ts` applique ce qu'elle rend.
 * Elle ne remplace pas les gardes (`requireUser`, `requirePermission`) : elle
 * les précède.
 */

import type { SignInErrorCode } from './errors';
import type { RefreshResult } from './refresher';
import { sanitizeReturnTo } from './return-to';
import { AUTH_ROUTES, isProtectedPath } from './routes';
import type { AuthRuntime } from './runtime';
import {
  MUTATION_RIGHTS_MAX_AGE,
  RIGHTS_MAX_AGE,
  type SessionPayload,
  openSession,
  sessionStanding,
} from './session';

export interface GateInput {
  method: string;
  pathname: string;
  /** Chaîne de requête, `?` compris (ou vide). */
  search: string;
  sessionCookie: string | null;
}

export type GateDecision = (
  | { action: 'pass' }
  | { action: 'redirect'; location: string }
  | { action: 'unavailable'; message: string }
) & {
  /** Nouvelle session à écrire dans le cookie (droits renouvelés, jeton tourné). */
  session?: SessionPayload;
  /** Le cookie de session est à effacer. */
  clearSession?: boolean;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function evaluateRequest(
  input: GateInput,
  runtime: AuthRuntime,
  refresh: (session: SessionPayload) => Promise<RefreshResult>,
): Promise<GateDecision> {
  const { config } = runtime;
  const guarded = isProtectedPath(input.pathname);
  const returnTo = sanitizeReturnTo(`${input.pathname}${input.search}`);

  const toSignInPage = (error?: SignInErrorCode): string => {
    const query = new URLSearchParams({ returnTo });
    if (error) query.set('error', error);
    return `${AUTH_ROUTES.signInPage}?${query.toString()}`;
  };
  /** Sans session valable : la connexion pour un espace protégé, rien de plus ailleurs. */
  const withoutSession = (
    extra: { clearSession?: boolean; error?: SignInErrorCode } = {},
  ): GateDecision => {
    const flags = extra.clearSession ? { clearSession: true } : {};
    return guarded
      ? { action: 'redirect', location: toSignInPage(extra.error), ...flags }
      : { action: 'pass', ...flags };
  };

  if (!input.sessionCookie) return withoutSession();

  const now = runtime.now();
  const session = await openSession(input.sessionCookie, config.sessionSecret, now);
  if (!session) return withoutSession({ clearSession: true });

  if (session.dev) {
    return config.devAuth ? { action: 'pass' } : withoutSession({ clearSession: true });
  }

  const mutation = guarded && !SAFE_METHODS.has(input.method.toUpperCase());
  const renewable = runtime.flow !== null && session.refreshToken !== undefined;
  // Une requête qui modifie quelque chose exige des droits tout frais – tant
  // qu'on a de quoi les redemander.
  const maxAge = mutation && renewable ? MUTATION_RIGHTS_MAX_AGE : RIGHTS_MAX_AGE;
  const standing = sessionStanding(session, { now, devAuth: config.devAuth, maxAge });

  if (standing === 'fresh') return { action: 'pass' };

  if (!renewable) {
    if (standing !== 'stale') return { action: 'pass' };
    // Pas de jeton de renouvellement : on repasse par Ascencia ID. Si la
    // session SSO vit encore, l'aller-retour est invisible.
    if (guarded && input.method.toUpperCase() === 'GET') {
      return {
        action: 'redirect',
        location: `${AUTH_ROUTES.signIn}?returnTo=${encodeURIComponent(returnTo)}`,
      };
    }
    return withoutSession({ error: 'session_ended' });
  }

  const result = await refresh(session);
  switch (result.kind) {
    case 'renewed':
      return { action: 'pass', session: result.session };

    case 'rejected':
      // Le fournisseur a dit non : rôle retiré au point de perdre l'accès,
      // compte banni, session révoquée. La session locale s'arrête là.
      return withoutSession({ clearSession: true, error: 'session_ended' });

    case 'rotated':
    case 'unavailable': {
      const carried = result.kind === 'rotated' ? { session: result.session } : {};
      if (mutation && standing === 'stale') {
        // Écriture avec des droits non confirmés : on refuse plutôt que de
        // créditer un compte au nom de quelqu'un qui n'a peut-être plus le droit.
        return {
          action: 'unavailable',
          message:
            'Ascencia ID ne répond pas : les droits n’ont pas pu être vérifiés, l’action est refusée. Réessayez dans un instant.',
          ...carried,
        };
      }
      // Lecture : on laisse passer. Au-delà de quinze minutes sans
      // confirmation, `getSession()` refuse la session de lui-même.
      return { action: 'pass', ...carried };
    }
  }
}
