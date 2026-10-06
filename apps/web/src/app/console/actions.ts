'use server';

import { z } from 'zod';
import { getGameDb } from '@enderium/game-db';
import { requirePermission } from '@/server/auth';
import { type ActionState, submitIntent } from '@/server/intents';

/**
 * Les actions de l'équipe. Chacune : vérifie la permission, valide la saisie,
 * dépose une intention. Aucune ne touche une donnée de jeu : le serveur
 * exécute, et le résultat se lit dans le journal des actions.
 */

const uuid = z.uuid().transform((value) => value.toLowerCase());
const idempotencyKey = z.string().regex(/^[A-Za-z0-9:_-]{8,64}$/);
const reason = z
  .string()
  .trim()
  .min(5, 'Le motif doit faire au moins 5 caractères.')
  .max(200, 'Le motif ne doit pas dépasser 200 caractères.')
  .regex(/^[^\r\n\t]*$/, 'Le motif tient sur une seule ligne.');

/** Plafond d'une opération depuis le site : au-delà, c'est une faute de frappe. */
const MAX_AMOUNT = 10_000_000;

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Les champs texte du formulaire, pour les rendre avec une erreur. */
function valuesOf(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of form) {
    if (typeof value === 'string') values[name] = value;
  }
  return values;
}

/** Une erreur repart toujours avec la saisie : personne ne retape son motif. */
function keepInput(form: FormData, state: ActionState): ActionState {
  return state.status === 'error' ? { ...state, values: valuesOf(form) } : state;
}

function invalid(error: z.ZodError): ActionState {
  return {
    status: 'error',
    message: 'Certains champs sont à corriger.',
    fieldErrors: fieldErrorsOf(error),
  };
}

// --- Économie ---------------------------------------------------------------

const balanceSchema = z.object({
  playerUuid: uuid,
  direction: z.enum(['deposit', 'withdraw']),
  amount: z.coerce
    .number('Le montant est un nombre entier de pièces.')
    .int('Le montant est un nombre entier de pièces.')
    .positive('Le montant doit être supérieur à zéro.')
    .max(MAX_AMOUNT, 'Le montant dépasse le plafond d’une opération (10 000 000 pièces).'),
  reason,
  idempotencyKey,
});

export async function adjustBalance(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePermission('economy.write');
  const parsed = balanceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return keepInput(form, invalid(parsed.error));
  const input = parsed.data;

  const state = await submitIntent(
    user,
    {
      kind: input.direction === 'deposit' ? 'economy.deposit' : 'economy.withdraw',
      payload: { playerUuid: input.playerUuid, amount: input.amount },
    },
    input,
  );
  return keepInput(form, state);
}

// --- Grades -----------------------------------------------------------------

const DAY_MS = 24 * 3600_000;

const grantSchema = z.object({
  playerUuid: uuid,
  groupId: z.string().min(1, 'Choisissez un grade.').max(64),
  /** Durée en jours ; vide ou 0 : sans échéance. */
  days: z.coerce
    .number('La durée est un nombre de jours.')
    .int('La durée est un nombre entier de jours.')
    .min(0, 'La durée ne peut pas être négative.')
    .max(3650, 'La durée ne peut pas dépasser dix ans.'),
  reason,
  idempotencyKey,
});

export async function grantGroup(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePermission('permissions.write');
  const parsed = grantSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return keepInput(form, invalid(parsed.error));
  const input = parsed.data;

  // Le serveur revérifie ; ce contrôle évite seulement de déposer une action perdue d'avance.
  const groups = await getGameDb().permissions.groups();
  if (!groups.some((group) => group.id === input.groupId)) {
    return keepInput(form, {
      status: 'error',
      message: 'Certains champs sont à corriger.',
      fieldErrors: { groupId: 'Ce grade n’existe pas.' },
    });
  }

  const state = await submitIntent(
    user,
    {
      kind: 'perms.member.add',
      payload: {
        playerUuid: input.playerUuid,
        groupId: input.groupId,
        expiresAt: input.days > 0 ? Date.now() + input.days * DAY_MS : 0,
      },
    },
    input,
  );
  return keepInput(form, state);
}

const revokeSchema = z.object({
  playerUuid: uuid,
  groupId: z.string().min(1).max(64),
  reason,
  idempotencyKey,
});

export async function revokeGroup(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePermission('permissions.write');
  const parsed = revokeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return keepInput(form, invalid(parsed.error));
  const input = parsed.data;

  const state = await submitIntent(
    user,
    {
      kind: 'perms.member.remove',
      payload: { playerUuid: input.playerUuid, groupId: input.groupId },
    },
    input,
  );
  return keepInput(form, state);
}

// --- Suivi ------------------------------------------------------------------

export interface IntentProgress {
  status: string;
  resultCode: string | null;
}

/** État d'une action déposée, pour le suivi affiché après l'envoi. */
export async function readIntentProgress(intentId: string): Promise<IntentProgress | null> {
  const user = await requirePermission('console.access');
  const id = z.uuid().safeParse(intentId);
  if (!id.success) return null;
  const intent = await getGameDb().link.intents.get(id.data);
  // Chacun suit ses propres actions ; le journal complet demande son droit.
  if (!intent || intent.actorId !== user.id) return null;
  return { status: intent.status, resultCode: intent.resultCode };
}
