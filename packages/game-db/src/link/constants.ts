/** Constantes du contrat « Lien » (`docs/contracts/intents.md`). */

/** Un serveur est en ligne si son dernier battement date de moins de 45 secondes. */
export const SERVER_ONLINE_WINDOW_MS = 45_000;

/** Durée de vie par défaut d'une intention : au-delà, le serveur la marque expirée. */
export const DEFAULT_INTENT_TTL_MS = 10 * 60 * 1000;

/** Le contrat exige un secret d'au moins 32 octets. */
export const MIN_LINK_SECRET_BYTES = 32;

/** Nom de la variable d'environnement du secret partagé. */
export const LINK_SECRET_ENV = 'ENDERIUM_LINK_SECRET';
