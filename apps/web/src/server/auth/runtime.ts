/**
 * Ce dont les routes et le proxy ont besoin pour travailler : la
 * configuration, le parcours OIDC et l'horloge. Regroupés pour que les tests
 * puissent tout remplacer d'un coup.
 */

import { type AuthConfig, getAuthConfig } from './config';
import { type OidcFlow, createOidcFlow } from './oidc';
import { nowInSeconds } from './session';

export interface AuthRuntime {
  readonly config: AuthConfig;
  /** `null` tant qu'Ascencia ID n'est pas configuré (hors production). */
  readonly flow: OidcFlow | null;
  /** Horloge en secondes. */
  readonly now: () => number;
}

let runtime: AuthRuntime | null = null;

/** Lève une `AuthConfigError` si l'environnement est invalide. */
export function getAuthRuntime(): AuthRuntime {
  if (!runtime) {
    const config = getAuthConfig();
    runtime = {
      config,
      flow: config.ascencia ? createOidcFlow(config.ascencia) : null,
      now: nowInSeconds,
    };
  }
  return runtime;
}
