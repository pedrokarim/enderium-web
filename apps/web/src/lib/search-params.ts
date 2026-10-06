/** Lecture et réécriture des filtres portés par l'adresse d'une page. */

export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

/** Au-delà, `game-db` refuse la page : aucune liste n'est aussi longue. */
const MAX_PAGE = 1_000_000;

/** Numéro de page : un entier entre 1 et le plafond, sinon 1. */
export function pageParam(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstParam(value) ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE ? parsed : 1;
}

/** La valeur si elle fait partie des choix permis, sinon rien. */
export function choiceParam<T extends string>(
  value: string | string[] | undefined,
  choices: readonly T[],
): T | undefined {
  const first = firstParam(value);
  return choices.find((choice) => choice === first);
}

/**
 * Adresse de la même page avec des paramètres changés. Une valeur `undefined`
 * retire le paramètre ; `page=1` n'est jamais écrit.
 */
export function hrefWith(
  pathname: string,
  current: Record<string, string | number | undefined>,
  changes: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    if (value === undefined || value === '') continue;
    if (key === 'page' && Number(value) === 1) continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${pathname}?${text}` : pathname;
}
