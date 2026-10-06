/** Les adresses de l'authentification, en un seul endroit. */
export const AUTH_ROUTES = {
  /** GET : départ vers Ascencia ID. Accepte `?returnTo=` et `?prompt=`. */
  signIn: '/auth/sign-in',
  /** GET : retour d'Ascencia ID. C'est l'URI de redirection enregistrée chez le fournisseur. */
  callback: '/auth/callback',
  /** POST (formulaire) : fin de la session. Champ optionnel `global=1`. */
  signOut: '/auth/sign-out',
  /** POST (formulaire) : connexion locale, développement seulement. Champs `profile`, `returnTo`. */
  devSignIn: '/auth/dev-sign-in',
  /** Page de connexion (interface). */
  signInPage: '/sign-in',
  /** Page « accès refusé » (interface). */
  deniedPage: '/denied',
} as const;

/** Les espaces qui exigent une session. */
export const PROTECTED_PREFIXES = ['/console', '/studio'] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
