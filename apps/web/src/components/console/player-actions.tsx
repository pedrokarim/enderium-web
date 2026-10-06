'use client';

import { useId } from 'react';
import { BadgeMinus, BadgePlus, Coins } from 'lucide-react';
import { Field, Input, Select } from '@enderium/ui';
import { adjustBalance, grantGroup, revokeGroup } from '@/app/console/actions';
import { IntentDialog } from './intent-dialog';

interface PlayerRef {
  uuid: string;
  name: string;
}

/** Créditer ou débiter le compte d'un joueur. */
export function BalanceDialog({ player }: { player: PlayerRef }) {
  const directionId = useId();
  const amountId = useId();
  return (
    <IntentDialog
      trigger={{ label: 'Ajuster le solde', icon: <Coins size={16} aria-hidden />, size: 'sm' }}
      title={`Ajuster le solde de ${player.name}`}
      description="Le serveur crée ou détruit les pièces et l’inscrit au journal de l’économie."
      action={adjustBalance}
      submit={{ label: 'Déposer l’action' }}
      hidden={{ playerUuid: player.uuid }}
    >
      {(errors, values) => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field htmlFor={directionId} label="Opération" error={errors.direction}>
            <Select id={directionId} name="direction" defaultValue={values.direction ?? 'deposit'}>
              <option value="deposit">Créditer</option>
              <option value="withdraw">Débiter</option>
            </Select>
          </Field>
          <Field htmlFor={amountId} label="Montant, en pièces" error={errors.amount}>
            <Input
              id={amountId}
              name="amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={10_000_000}
              step={1}
              defaultValue={values.amount}
              required
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? `${amountId}-error` : undefined}
            />
          </Field>
        </div>
      )}
    </IntentDialog>
  );
}

/** Donner un grade à un joueur, avec ou sans échéance. */
export function GrantGroupDialog({
  player,
  groups,
}: {
  player: PlayerRef;
  /** Les grades que le joueur n'a pas encore, du plus haut au plus bas. */
  groups: { id: string }[];
}) {
  const groupId = useId();
  const daysId = useId();
  return (
    <IntentDialog
      trigger={{ label: 'Donner un grade', icon: <BadgePlus size={16} aria-hidden />, size: 'sm' }}
      title={`Donner un grade à ${player.name}`}
      description="Le grade s’applique dès que le serveur a exécuté l’action, même si le joueur est en jeu."
      action={grantGroup}
      submit={{ label: 'Déposer l’action' }}
      hidden={{ playerUuid: player.uuid }}
    >
      {(errors, values) => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field htmlFor={groupId} label="Grade" error={errors.groupId}>
            <Select id={groupId} name="groupId" required defaultValue={values.groupId ?? ''}>
              <option value="" disabled>
                Choisir…
              </option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.id}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            htmlFor={daysId}
            label="Durée, en jours"
            hint="0 : sans échéance."
            error={errors.days}
          >
            <Input
              id={daysId}
              name="days"
              type="number"
              inputMode="numeric"
              min={0}
              max={3650}
              step={1}
              defaultValue={values.days ?? 0}
              required
              aria-invalid={errors.days ? true : undefined}
              aria-describedby={errors.days ? `${daysId}-error` : `${daysId}-hint`}
            />
          </Field>
        </div>
      )}
    </IntentDialog>
  );
}

/** Retirer un grade : l'action qui enlève, donc en rouge et confirmée par un motif. */
export function RevokeGroupDialog({ player, groupId }: { player: PlayerRef; groupId: string }) {
  return (
    <IntentDialog
      trigger={{
        label: 'Retirer',
        icon: <BadgeMinus size={16} aria-hidden />,
        variant: 'ghost',
        size: 'sm',
      }}
      title={`Retirer le grade ${groupId} à ${player.name}`}
      description="Le joueur perd tout de suite les droits que ce grade lui donnait."
      action={revokeGroup}
      submit={{ label: 'Retirer le grade', variant: 'danger' }}
      hidden={{ playerUuid: player.uuid, groupId }}
    />
  );
}
