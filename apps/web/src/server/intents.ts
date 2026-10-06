import 'server-only';

import {
  type EnqueueIntentInput,
  InvalidIntentError,
  LinkUnavailableError,
  getGameDb,
} from '@enderium/game-db';
import type { ConsoleUser } from '@/server/auth';

/** Ce qu'une action serveur rend au formulaire qui l'a envoyée. */
export type ActionState =
  | { status: 'idle' }
  | {
      status: 'error';
      message: string;
      fieldErrors?: Record<string, string>;
      /** La saisie, rendue au formulaire : React le vide après chaque envoi. */
      values?: Record<string, string>;
    }
  | { status: 'submitted'; intentId: string };

export const IDLE: ActionState = { status: 'idle' };

/** Une action demandée par l'équipe, sans ce qui décrit son auteur. */
export type IntentRequest = {
  [K in EnqueueIntentInput['kind']]: Pick<
    Extract<EnqueueIntentInput, { kind: K }>,
    'kind' | 'payload'
  >;
}[EnqueueIntentInput['kind']];

const UNAVAILABLE_MESSAGES = {
  'tables-missing':
    'Le plugin EnderiumLink n’est pas installé sur le serveur : aucune action ne peut lui être envoyée.',
  'secret-missing':
    'Le site n’a pas de secret de lien (ENDERIUM_LINK_SECRET) : il ne peut signer aucune action.',
  'secret-too-short': 'Le secret de lien du site est trop court pour être accepté par le serveur.',
} as const;

/**
 * Dépose une intention au nom de la personne connectée et rend l'état à
 * afficher. La permission a déjà été vérifiée par l'appelant.
 *
 * La clé d'idempotence vient du formulaire (tirée à son ouverture) : un double
 * clic ou un renvoi du navigateur ne dépose pas l'action deux fois.
 */
export async function submitIntent(
  user: ConsoleUser,
  request: IntentRequest,
  envelope: { idempotencyKey: string; reason: string },
): Promise<ActionState> {
  try {
    const result = await getGameDb().link.intents.enqueue({
      ...request,
      idempotencyKey: envelope.idempotencyKey,
      reason: envelope.reason,
      actorId: user.id,
      actorName: user.displayName,
      actorUuid: user.minecraftUuid,
    } as EnqueueIntentInput);

    if (!result.created && !result.sameRequest) {
      return {
        status: 'error',
        message: 'Ce formulaire a déjà servi pour une autre action. Rouvrez-le et recommencez.',
      };
    }
    return { status: 'submitted', intentId: result.intent.id };
  } catch (cause) {
    if (cause instanceof LinkUnavailableError) {
      return { status: 'error', message: UNAVAILABLE_MESSAGES[cause.reason] };
    }
    if (cause instanceof InvalidIntentError) {
      return {
        status: 'error',
        message: 'L’action a été refusée : ses paramètres sont invalides.',
      };
    }
    throw cause;
  }
}
