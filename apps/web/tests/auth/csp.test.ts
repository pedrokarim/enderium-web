import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, createNonce } from '../../src/server/auth/csp';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');
      return [name, values];
    }),
  );
}

describe('politique de sécurité du contenu', () => {
  const production = directives(
    buildContentSecurityPolicy({
      nonce: 'bm9uY2U=',
      development: false,
      issuerOrigin: 'https://id.ascencia.re',
      upgradeInsecureRequests: true,
    }),
  );

  it('n’exécute que les scripts qui portent le nonce de la requête', () => {
    expect(production.get('script-src')).toEqual([
      "'self'",
      "'nonce-bm9uY2U='",
      "'strict-dynamic'",
    ]);
    expect(production.get('script-src')).not.toContain("'unsafe-inline'");
    expect(production.get('script-src')).not.toContain("'unsafe-eval'");
  });

  it('ferme les cadres, les objets, la balise base et les formulaires vers ailleurs', () => {
    expect(production.get('default-src')).toEqual(["'self'"]);
    expect(production.get('frame-ancestors')).toEqual(["'none'"]);
    expect(production.get('object-src')).toEqual(["'none'"]);
    expect(production.get('base-uri')).toEqual(["'self'"]);
    expect(production.get('connect-src')).toEqual(["'self'"]);
    // Seule exception : la déconnexion globale, qui part d'un formulaire vers Ascencia ID.
    expect(production.get('form-action')).toEqual(["'self'", 'https://id.ascencia.re']);
    expect(production.has('upgrade-insecure-requests')).toBe(true);
  });

  it('n’autorise eval qu’en développement', () => {
    const development = directives(
      buildContentSecurityPolicy({
        nonce: 'bm9uY2U=',
        development: true,
        issuerOrigin: null,
        upgradeInsecureRequests: false,
      }),
    );
    expect(development.get('script-src')).toContain("'unsafe-eval'");
    expect(development.get('form-action')).toEqual(["'self'"]);
    expect(development.has('upgrade-insecure-requests')).toBe(false);
  });

  it('tire un nonce imprévisible à chaque requête', () => {
    const nonces = new Set(Array.from({ length: 200 }, () => createNonce()));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{24}$/);
  });
});
