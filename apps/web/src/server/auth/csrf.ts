/**
 * Protection CSRF des routes POST écrites à la main (`/auth/sign-out`,
 * `/auth/dev-sign-in`, et toute future route de la console).
 *
 * Ce que Next 16 fait déjà : les actions serveur n'acceptent que POST et
 * comparent l'en-tête `Origin` à l'hôte de la requête. Ce contrôle **ne couvre
 * pas** les route handlers : c'est ce que ce fichier ajoute.
 *
 * Le cookie de session est `SameSite=Lax`, donc un POST venu d'un autre site
 * n'emporte déjà pas la session. Vérifier l'origine en plus ferme les cas que
 * `Lax` laisse ouverts (sous-domaine voisin, considéré comme le même « site »).
 */

/**
 * La requête vient-elle d'une page du site lui-même ?
 *
 * On compare à `APP_URL`, pas à l'en-tête `Host` : derrière un répartiteur,
 * `Host` est ce que le répartiteur veut bien transmettre.
 */
export function isSameOriginRequest(request: Request, appOrigin: string): boolean {
  // Tous les navigateurs envoient `Origin` sur un POST. Une valeur présente
  // fait foi, y compris `null` (page en bac à sable, redirection opaque).
  const origin = request.headers.get('origin');
  if (origin !== null) return origin === appOrigin;

  // Sans `Origin`, l'en-tête Fetch Metadata est posé par le navigateur et une
  // page ne peut pas le falsifier.
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null) return fetchSite === 'same-origin';

  const referer = request.headers.get('referer');
  if (referer !== null) {
    try {
      return new URL(referer).origin === appOrigin;
    } catch {
      return false;
    }
  }

  // Aucun indice : on refuse. Un client qui n'envoie ni `Origin` ni `Referer`
  // sur un POST n'est pas un navigateur ordinaire.
  return false;
}

/** Réponse à rendre quand le contrôle échoue. */
export function crossOriginRefusal(): Response {
  return new Response('Requête refusée : origine non autorisée.', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
