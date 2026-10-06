/**
 * Politique de sécurité du contenu (CSP), posée par le proxy à chaque page.
 *
 * Elle est stricte sur les scripts : seul un script portant le `nonce` de la
 * requête s'exécute, plus ceux qu'il charge lui-même (`strict-dynamic`). Un
 * script injecté dans une page ne porte pas ce nonce et reste lettre morte.
 * Next lit le nonce dans l'en-tête de la requête et le pose seul sur ses
 * propres balises – à condition que la page soit rendue à la demande, ce qui
 * est le cas de tout le site (la mise en page racine lit un cookie).
 */

export interface ContentSecurityPolicyOptions {
  nonce: string;
  development: boolean;
  /** Origine d'Ascencia ID : cible de la déconnexion globale, qui part d'un formulaire. */
  issuerOrigin: string | null;
  /** À activer quand le site est servi en https (inutile, voire gênant, sur http://localhost). */
  upgradeInsecureRequests: boolean;
}

export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const formTargets = ["'self'", ...(options.issuerOrigin ? [options.issuerOrigin] : [])];

  const directives = [
    "default-src 'self'",
    // En développement, React reconstruit les piles d'erreurs avec `eval`.
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ''}`,
    // Les styles en ligne restent permis : React écrit des attributs `style`
    // au rendu serveur, et un nonce ne couvre pas les attributs. Une feuille
    // de style ne peut ni lire un cookie httpOnly ni appeler une action.
    "style-src 'self' 'unsafe-inline'",
    // Avatars servis par Ascencia ID ou par les fournisseurs liés au compte.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${options.development ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formTargets.join(' ')}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];
  if (options.upgradeInsecureRequests) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
