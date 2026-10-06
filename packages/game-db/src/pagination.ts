/** Pagination uniforme de toutes les listes : `{ page, pageSize }` → `{ rows, total, page, pageSize }`. */
import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
/** Garde-fou : au-delà, le décalage n'a plus de sens et coûterait cher à la base. */
const MAX_PAGE = 1_000_000;

/** Ce que l'appelant fournit ; tout est facultatif. */
export interface PageInput {
  /** Numéro de page, à partir de 1. Défaut : 1. */
  page?: number | undefined;
  /** Lignes par page. Défaut : {@link DEFAULT_PAGE_SIZE} ; ramené à {@link MAX_PAGE_SIZE} au-delà. */
  pageSize?: number | undefined;
}

/** Une page de résultats. */
export interface Page<T> {
  rows: T[];
  /** Nombre total de lignes qui répondent aux filtres, toutes pages confondues. */
  total: number;
  page: number;
  pageSize: number;
  /** Nombre de pages (au moins 1, même sans résultat). */
  pageCount: number;
}

/** À étaler dans le schéma zod d'une liste. */
export const pageShape = {
  page: z.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((size) => Math.min(size, MAX_PAGE_SIZE)),
};

export interface ResolvedPage {
  page: number;
  pageSize: number;
}

export function offsetOf(page: ResolvedPage): number {
  return (page.page - 1) * page.pageSize;
}

export function toPage<T>(rows: T[], total: number, page: ResolvedPage): Page<T> {
  return {
    rows,
    total,
    page: page.page,
    pageSize: page.pageSize,
    pageCount: Math.max(1, Math.ceil(total / page.pageSize)),
  };
}

/** La page vide rendue quand le module interrogé n'est pas installé. */
export function emptyPage<T>(page: ResolvedPage): Page<T> {
  return toPage<T>([], 0, page);
}
