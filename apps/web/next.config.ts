import type { NextConfig } from 'next';

/**
 * En-têtes de sécurité posés sur **toutes** les réponses.
 *
 * La politique de contenu complète (scripts sous nonce) est posée par le proxy
 * (`src/proxy.ts`), requête par requête : un nonce ne peut pas être écrit ici,
 * cette liste étant figée à la construction. Celle-ci n'est qu'un socle, pour
 * les réponses qui ne passeraient pas par le proxy.
 */
const securityHeaders = [
  // Le navigateur ne devine pas un type à la place de celui annoncé.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Le site ne s'affiche dans aucun cadre (détournement de clic).
  { key: 'X-Frame-Options', value: 'DENY' },
  // Hors du site, seule l'origine part dans `Referer`, jamais le chemin.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Aucune de ces capacités n'est utilisée : elles sont fermées, cadres compris.
  {
    key: 'Permissions-Policy',
    value:
      'accelerometer=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  },
  // Deux ans, sous-domaines compris. Ignoré par les navigateurs en http (développement local).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Aucune fenêtre ouverte depuis le site ne garde de prise sur lui.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Fermé à l'indexation tant que le site n'a pas de pages publiques.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  {
    key: 'Content-Security-Policy',
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // En développement, la pastille de Next se range à droite : à gauche, elle
  // recouvrirait le compte connecté au bas de la barre latérale.
  devIndicators: { position: 'bottom-right' },
  // Sortie autonome : l'image de production n'emporte que ce que Next a tracé.
  output: 'standalone',
  // Les packages du monorepo sont livrés en source : Next les compile.
  // Les SDK d'Ascencia ID sont publiés en TypeScript, eux aussi.
  transpilePackages: [
    '@enderium/ui',
    '@enderium/game-db',
    '@ascencia/id-core',
    '@ascencia/id-server',
    '@ascencia/id-rbac',
  ],
  // Pilotes de base de données : jamais empaquetés, chargés par Node.
  serverExternalPackages: ['pg', 'mysql2'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
