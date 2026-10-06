/**
 * Validation de la destination de retour après connexion.
 *
 * `returnTo` vient de l'URL, donc de n'importe qui. Sans contrôle,
 * `/auth/sign-in?returnTo=https://faux-site.example` ferait de la page de
 * connexion un tremplin vers un site d'hameçonnage. On n'accepte qu'un
 * **chemin interne**.
 */

export const DEFAULT_RETURN_TO = '/console';

const MAX_LENGTH = 2048;
/** Origine factice : sert seulement à faire analyser le chemin par `URL`. */
const PROBE_ORIGIN = 'http://internal.invalid';

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Rend un chemin interne sûr (`/console/players?page=2`), ou `fallback`.
 *
 * Refusés : tout ce qui n'est pas une chaîne commençant par une seule barre,
 * `//hôte` et `/\hôte` (lus comme une autre origine par les navigateurs), les
 * caractères de contrôle, et les routes `/auth/…` (une boucle de connexion).
 */
export function sanitizeReturnTo(value: unknown, fallback: string = DEFAULT_RETURN_TO): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  // Les navigateurs traitent `\` comme `/` : `/\evil.example` sort du site.
  if (value.includes('\\')) return fallback;
  // Caractères de contrôle (tabulation, saut de ligne…) : certains
  // navigateurs les retirent avant d'analyser l'URL, ce qui recompose `//`.
  if (hasControlCharacter(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  // L'analyse normalise `/./` et `/../` : c'est le chemin normalisé qui compte.
  if (url.pathname.startsWith('//')) return fallback;
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
