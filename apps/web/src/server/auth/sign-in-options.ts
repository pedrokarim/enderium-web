/**
 * Ce dont les pages `/sign-in` et `/denied` ont besoin pour s'afficher, sans
 * rien savoir de la configuration ni des secrets.
 */

import { AuthConfigError, getAuthConfig } from './config';
import { describeSignInError } from './errors';
import { DEV_PROFILES, type DevProfileId } from './permissions';
import { DEFAULT_RETURN_TO, sanitizeReturnTo } from './return-to';
import { AUTH_ROUTES } from './routes';

export interface SignInOptions {
  /** Connexion par Ascencia ID. */
  ascencia: {
    /** `false` tant que les variables `ASCENCIA_*` ne sont pas renseignées. */
    configured: boolean;
    /** Lien du bouton « Se connecter » (GET), destination de retour comprise. */
    href: string;
  };
  /** Connexion locale de développement. Jamais ouverte en production. */
  devAuth: {
    enabled: boolean;
    /** `action` du formulaire (POST). Champs : `profile`, `returnTo`. */
    action: string;
    profiles: readonly { id: DevProfileId; label: string }[];
  };
  /** Destination de retour validée (chemin interne), à remettre dans les formulaires. */
  returnTo: string;
  /** Message à afficher pour `?error=…`, déjà rédigé ; `null` s'il n'y a rien à dire. */
  errorMessage: string | null;
  /** `true` au retour d'une déconnexion (`?signedOut=1`). */
  signedOut: boolean;
  /** L'environnement est invalide : aucune connexion n'est possible. Le détail est dans le journal du serveur. */
  misconfigured: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * À appeler depuis la page `/sign-in` avec ses `searchParams` (déjà attendus).
 *
 * ```tsx
 * const options = getSignInOptions(await searchParams);
 * ```
 */
export function getSignInOptions(searchParams: SearchParams = {}): SignInOptions {
  const returnTo = sanitizeReturnTo(first(searchParams.returnTo), DEFAULT_RETURN_TO);
  const signInHref = `${AUTH_ROUTES.signIn}?returnTo=${encodeURIComponent(returnTo)}`;
  const profiles = (Object.keys(DEV_PROFILES) as DevProfileId[]).map((id) => ({
    id,
    label: DEV_PROFILES[id].label,
  }));

  let configured = false;
  let devAuth = false;
  let misconfigured = false;
  try {
    const config = getAuthConfig();
    configured = config.ascencia !== null;
    devAuth = config.devAuth;
  } catch (cause) {
    if (!(cause instanceof AuthConfigError)) throw cause;
    console.error(cause.message);
    misconfigured = true;
  }

  return {
    ascencia: { configured, href: signInHref },
    devAuth: { enabled: devAuth, action: AUTH_ROUTES.devSignIn, profiles },
    returnTo,
    errorMessage: describeSignInError(first(searchParams.error)),
    signedOut: first(searchParams.signedOut) === '1',
    misconfigured,
  };
}

/** `action` du formulaire de déconnexion (POST). Champ optionnel `global=1` : quitter aussi Ascencia ID. */
export const SIGN_OUT_ACTION = AUTH_ROUTES.signOut;
