/** Les erreurs typées du package : l'interface peut les reconnaître et les expliquer. */

/** Racine de toutes les erreurs levées volontairement par `@enderium/game-db`. */
export class GameDbError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Configuration absente ou illisible (`ENDERIUM_DB_URL`, URL de forme inconnue). */
export class GameDbConfigError extends GameDbError {}

/** Un détail d'une entrée refusée, dans la forme des `issues` de zod. */
export interface InputIssue {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
}

/** Une entrée (filtre, pagination, identifiant) ne respecte pas son schéma. */
export class InvalidInputError extends GameDbError {
  readonly issues: ReadonlyArray<InputIssue>;

  constructor(message: string, issues: ReadonlyArray<InputIssue>) {
    super(message);
    this.issues = issues;
  }
}

/** Une intention est refusée avant tout dépôt : `kind` inconnu, `payload` ou motif invalide. */
export class InvalidIntentError extends InvalidInputError {}

/**
 * Un entier de la base sort de l'intervalle sûr de JavaScript (±2^53 − 1). On préfère échouer
 * que rendre un montant ou une date arrondis en silence.
 */
export class UnsafeIntegerError extends GameDbError {
  readonly value: string;
  readonly column: string | undefined;

  constructor(value: string, column?: string) {
    super(
      column === undefined
        ? `Entier hors de l'intervalle sûr : ${value}`
        : `Entier hors de l'intervalle sûr dans « ${column} » : ${value}`,
    );
    this.value = value;
    this.column = column;
  }
}

/** Pourquoi le lien site → serveur ne peut pas recevoir d'intention. */
export type LinkUnavailableReason =
  /** Les tables `link_*` n'existent pas : le plugin EnderiumLink n'est pas installé. */
  | 'tables-missing'
  /** Aucun secret partagé n'est configuré (`ENDERIUM_LINK_SECRET`). */
  | 'secret-missing'
  /** Le secret fait moins de 32 octets : le contrat le refuse. */
  | 'secret-too-short';

/** Le dépôt d'une intention est impossible : la console reste en lecture seule. */
export class LinkUnavailableError extends GameDbError {
  readonly reason: LinkUnavailableReason;

  constructor(reason: LinkUnavailableReason) {
    super(LINK_UNAVAILABLE_MESSAGES[reason]);
    this.reason = reason;
  }
}

const LINK_UNAVAILABLE_MESSAGES: Record<LinkUnavailableReason, string> = {
  'tables-missing': 'Les tables du lien (link_intents, link_servers) sont absentes de la base.',
  'secret-missing': 'Aucun secret de lien configuré (ENDERIUM_LINK_SECRET).',
  'secret-too-short': 'Le secret de lien fait moins de 32 octets.',
};
