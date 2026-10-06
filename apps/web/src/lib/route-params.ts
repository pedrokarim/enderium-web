/** Lecture des segments dynamiques d'une adresse (`/console/permissions/[id]`). */

/**
 * Le segment décodé s'il respecte le motif, sinon `null` (la page répond alors
 * « introuvable » sans interroger la base). Le décodage est refait ici : selon
 * le caractère, le routeur rend le segment décodé ou tel qu'il a été écrit.
 * Les motifs n'admettent pas `%`, un second décodage ne change donc rien.
 */
export function segmentParam(value: string, pattern: RegExp): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return pattern.test(decoded) ? decoded : null;
}
