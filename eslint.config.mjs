import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['**/.next/**', '**/node_modules/**', '**/dist/**', '**/next-env.d.ts'] },
  ...nextVitals,
  ...nextTypescript,
  {
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      // Les vignettes sont de petites images servies par le site lui-même.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
