/**
 * Codes d'échec de la connexion, tels qu'ils arrivent sur `/sign-in?error=…`.
 *
 * Le code est stable et court ; le message est écrit pour la personne qui se
 * connecte. Aucun détail technique ni cryptographique n'atteint la page.
 */

export const SIGN_IN_ERROR_MESSAGES = {
  not_configured: 'La connexion par Ascencia ID n’est pas encore configurée sur ce site.',
  provider_unavailable: 'Ascencia ID ne répond pas pour le moment. Réessayez dans un instant.',
  provider_error: 'Ascencia ID a refusé la demande de connexion.',
  access_denied: 'Ce compte n’a pas accès à la console d’Enderium.',
  login_required: 'La session Ascencia ID a pris fin. Reconnectez-vous.',
  invalid_state: 'La demande de connexion a expiré ou ne vient pas de ce navigateur. Recommencez.',
  exchange_failed: 'La connexion n’a pas pu être finalisée. Recommencez.',
  invalid_token: 'La réponse d’Ascencia ID n’a pas pu être vérifiée.',
  permissions_unavailable:
    'Ascencia ID n’a pas transmis les droits de ce compte. Prévenez un administrateur.',
  impersonation_refused:
    'La console refuse les sessions d’assistance ouvertes au nom d’un autre compte.',
  session_ended: 'La session a pris fin. Reconnectez-vous.',
} as const satisfies Record<string, string>;

export type SignInErrorCode = keyof typeof SIGN_IN_ERROR_MESSAGES;

export function isSignInErrorCode(value: unknown): value is SignInErrorCode {
  return typeof value === 'string' && Object.hasOwn(SIGN_IN_ERROR_MESSAGES, value);
}

/** Message à afficher pour le paramètre `error` de `/sign-in`, ou `null` s'il est inconnu. */
export function describeSignInError(value: unknown): string | null {
  return isSignInErrorCode(value) ? SIGN_IN_ERROR_MESSAGES[value] : null;
}

/** Échec du parcours OIDC. `code` part dans l'URL, `cause` reste côté serveur. */
export class SignInError extends Error {
  override readonly name = 'SignInError';

  constructor(
    readonly code: SignInErrorCode,
    options?: { cause?: unknown },
  ) {
    super(SIGN_IN_ERROR_MESSAGES[code], options);
  }
}
