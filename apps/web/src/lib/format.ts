/**
 * Mise en forme des valeurs affichées par la console. Tout est en français et
 * dans le fuseau du serveur de jeu, pour que deux membres de l'équipe lisent
 * la même heure quel que soit leur navigateur.
 */

const LOCALE = 'fr-FR';
const TIME_ZONE = 'Europe/Paris';

const numberFormat = new Intl.NumberFormat(LOCALE);
const compactFormat = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});
const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: TIME_ZONE });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** Ce qu'on écrit à la place d'une valeur absente. */
export const EMPTY = '–';

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatCompact(value: number): string {
  return compactFormat.format(value);
}

/** Un montant en pièces. La monnaie d'Enderium n'a pas de centimes. */
export function formatCoins(amount: number): string {
  return `${numberFormat.format(amount)} pièces`;
}

/** Un montant signé : `+ 250` pour une entrée, `− 250` pour une sortie. */
export function formatSignedCoins(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign} ${numberFormat.format(Math.abs(amount))}`.trim();
}

/** Les dates de la base : millisecondes UTC, `0` quand la date est absente. */
export function formatDateTime(millis: number): string {
  return millis > 0 ? dateTimeFormat.format(millis) : EMPTY;
}

export function formatDate(millis: number): string {
  return millis > 0 ? dateFormat.format(millis) : EMPTY;
}

const RELATIVE_STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
];

/** « il y a 3 heures », « dans 2 jours ». */
export function formatRelative(millis: number, now: number = Date.now()): string {
  if (millis <= 0) return EMPTY;
  const delta = millis - now;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(delta) >= size) return relativeFormat.format(Math.round(delta / size), unit);
  }
  return 'à l’instant';
}

/** Une durée lisible : « 2 h 05 », « 14 min », « 38 s ». */
export function formatDuration(millis: number): string {
  const totalSeconds = Math.max(0, Math.round(millis / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}

/** L'instant d'il y a `days` jours, en millisecondes : borne basse d'une période glissante. */
export function daysAgo(days: number): number {
  return Date.now() - days * 24 * 3600_000;
}

/** Forme courte d'un UUID, pour les tableaux : les huit premiers caractères. */
export function shortUuid(uuid: string): string {
  return uuid.length > 8 ? `${uuid.slice(0, 8)}…` : uuid;
}

/** Pluriel français : zéro et un prennent le singulier. */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${numberFormat.format(count)} ${count < 2 ? singular : pluralForm}`;
}
