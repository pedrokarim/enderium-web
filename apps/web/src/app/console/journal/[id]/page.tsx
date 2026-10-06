import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Notice,
  PageHeader,
  PageStack,
} from '@enderium/ui';
import { getGameDb } from '@enderium/game-db';
import { can, requirePermission } from '@/server/auth';
import { PlayerLink } from '@/components/console/common';
import { EMPTY, formatDateTime, formatDuration } from '@/lib/format';
import { intentKindLabel, intentStatus, resultCodeLabel } from '@/lib/labels';

export const metadata: Metadata = { title: 'Action' };

const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Le JSON d'une action, indenté pour la lecture. */
function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function playerUuidOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>).playerUuid;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

export default async function IntentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('journal.read');
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const db = getGameDb();
  const intent = await db.link.intents.get(id);
  if (!intent) notFound();

  const described = intentStatus(intent.status);
  const targetUuid = playerUuidOf(intent.payload);
  const target = targetUuid && can(user, 'players.read') ? await db.players.get(targetUuid) : null;
  const waiting = intent.status === 'pending' || intent.status === 'running';

  return (
    <PageStack>
      <PageHeader
        crumbsLabel="Fil d’Ariane"
        crumbs={[
          { label: 'Journal des actions', href: '/console/journal' },
          { label: intentKindLabel(intent.kind) },
        ]}
        title={intentKindLabel(intent.kind)}
        meta={<Badge tone={described.tone}>{described.label}</Badge>}
        description={<span className="font-mono text-[13px]">{intent.id}</span>}
      />

      {waiting ? (
        <Notice tone="info" title="Le serveur n’a pas encore rendu son résultat">
          Une action attend au plus jusqu’au {formatDateTime(intent.expiresAt)}, puis expire sans
          être exécutée.
        </Notice>
      ) : null}
      {intent.status === 'failed' ? (
        <Notice tone="danger" title="L’action a échoué en cours d’exécution">
          Elle n’est jamais rejouée automatiquement : vérifiez l’état réel en jeu avant de la
          redéposer.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Demande" />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Auteur', value: intent.actorName },
                { label: 'Déposée le', value: formatDateTime(intent.createdAt) },
                { label: 'Motif', value: intent.reason },
                {
                  label: 'Joueur visé',
                  value: targetUuid ? (
                    <PlayerLink uuid={targetUuid} name={target?.name ?? null} />
                  ) : (
                    EMPTY
                  ),
                },
                { label: 'Serveur destinataire', value: intent.targetServer ?? 'N’importe lequel' },
                { label: 'Expire le', value: formatDateTime(intent.expiresAt) },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Exécution" />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                { label: 'État', value: described.label },
                {
                  label: 'Résultat',
                  value: intent.resultCode ? resultCodeLabel(intent.resultCode) : EMPTY,
                },
                { label: 'Prise en charge par', value: intent.claimedBy ?? EMPTY },
                {
                  label: 'Prise en charge le',
                  value: intent.claimedAt ? formatDateTime(intent.claimedAt) : EMPTY,
                },
                {
                  label: 'Terminée le',
                  value: intent.finishedAt ? formatDateTime(intent.finishedAt) : EMPTY,
                },
                {
                  label: 'Délai total',
                  value: intent.finishedAt
                    ? formatDuration(intent.finishedAt - intent.createdAt)
                    : EMPTY,
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Paramètres" description="Tels qu’ils ont été signés et déposés." />
          <CardBody>
            <pre className="rounded-field bg-surface-sunken text-fg overflow-x-auto p-3 font-mono text-[13px]">
              {pretty(intent.payload)}
            </pre>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Détail rendu par le serveur" />
          <CardBody>
            {intent.resultDetail === null || intent.resultDetail === undefined ? (
              <p className="text-fg-muted text-sm">Aucun détail.</p>
            ) : (
              <pre className="rounded-field bg-surface-sunken text-fg overflow-x-auto p-3 font-mono text-[13px]">
                {pretty(intent.resultDetail)}
              </pre>
            )}
          </CardBody>
        </Card>
      </div>
    </PageStack>
  );
}
