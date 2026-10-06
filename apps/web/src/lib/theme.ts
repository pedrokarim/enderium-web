export const THEME_COOKIE = 'enderium-theme';

export type Theme = 'light' | 'dark';

/** Lit la valeur du cookie ; toute autre valeur vaut « suivre le système ». */
export function parseTheme(value: string | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}
