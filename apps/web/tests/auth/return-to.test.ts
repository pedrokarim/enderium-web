import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_TO, sanitizeReturnTo } from '../../src/server/auth/return-to';

describe('validation de returnTo', () => {
  it.each([
    ['/console', '/console'],
    ['/console/players', '/console/players'],
    ['/console/players?page=2&sort=name', '/console/players?page=2&sort=name'],
    ['/studio/items#sword', '/studio/items#sword'],
    ['/', '/'],
    // Une URL placée dans un paramètre n'est pas une redirection : le chemin reste interne.
    ['/console?next=https://evil.example', '/console?next=https://evil.example'],
  ])('accepte le chemin interne %s', (value, expected) => {
    expect(sanitizeReturnTo(value)).toBe(expected);
  });

  it.each([
    ['URL absolue', 'https://evil.example/console'],
    ['URL absolue en http', 'http://evil.example'],
    ['URL sans schéma', '//evil.example/console'],
    ['trois barres', '///evil.example'],
    ['barre oblique inversée', '/\\evil.example'],
    ['barres inversées seules', '\\\\evil.example'],
    ['barre puis tabulation puis barre', '/\t/evil.example'],
    ['saut de ligne', '/console\n//evil.example'],
    ['retour chariot', '/\r/evil.example'],
    ['caractère nul', '/console\u0000'],
    ['schéma javascript', 'javascript:alert(1)'],
    ['schéma data', 'data:text/html,<script>alert(1)</script>'],
    ['chemin relatif', 'console/players'],
    ['chemin relatif remontant', '../console'],
    ['identifiants dans l’URL', 'https://enderium.ascencia.re@evil.example/'],
    ['chaîne vide', ''],
    ['espace en tête', ' /console'],
    ['points qui recomposent une double barre', '/.//evil.example'],
    ['boucle sur la connexion', '/auth/sign-in?returnTo=/console'],
    ['boucle sur le retour', '/auth/callback'],
    ['route d’authentification nue', '/auth'],
    ['route d’authentification atteinte par remontée', '/console/../auth/sign-out'],
  ])('refuse : %s', (_label, value) => {
    expect(sanitizeReturnTo(value)).toBe(DEFAULT_RETURN_TO);
  });

  it.each([[null], [undefined], [42], [{}], [['/console']]])(
    'refuse ce qui n’est pas une chaîne (%j)',
    (value) => {
      expect(sanitizeReturnTo(value)).toBe(DEFAULT_RETURN_TO);
    },
  );

  it('refuse une valeur démesurée', () => {
    expect(sanitizeReturnTo(`/console?q=${'a'.repeat(3000)}`)).toBe(DEFAULT_RETURN_TO);
  });

  it('normalise les remontées qui restent dans le site', () => {
    expect(sanitizeReturnTo('/console/players/../economy')).toBe('/console/economy');
  });

  it('rend toujours un chemin qui reste sur le site une fois résolu', () => {
    const origin = 'https://enderium.ascencia.re';
    for (const value of [
      '/console',
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      '/.//evil.example',
      '/%2F%2Fevil.example',
      '/console/%2e%2e/%2e%2e//evil.example',
    ]) {
      expect(new URL(sanitizeReturnTo(value), origin).origin).toBe(origin);
    }
  });

  it('retombe sur la destination par défaut fournie', () => {
    expect(sanitizeReturnTo('https://evil.example', '/studio')).toBe('/studio');
  });
});
