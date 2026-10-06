import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Cell,
  DescriptionList,
  EmptyState,
  HeaderCell,
  PageHeader,
  PageStack,
  Row,
  StatGrid,
  StatTile,
  Table,
  TableBody,
  TableHead,
  buttonClass,
} from '@enderium/ui';
import { getGameDb } from '@enderium/game-db';
import { can, requirePermission } from '@/server/auth';
import { GroupChip } from '@/components/console/common';
import {
  BalanceDialog,
  GrantGroupDialog,
  RevokeGroupDialog,
} from '@/components/console/player-actions';
import {
  EMPTY,
  formatCoins,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  formatSignedCoins,
} from '@/lib/format';
import { gameModeLabel, ledgerKindLabel } from '@/lib/labels';

const UUID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

interface Props {
  params: Promise<{ uuid: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requirePermission('players.read');
  const { uuid } = await params;
  if (!UUID_PATTERN.test(uuid)) return { title: 'Joueur introuvable' };
  const player = await getGameDb().players.get(uuid);
  return { title: player?.name ?? 'Joueur introuvable' };
}

export default async function PlayerPage({ params }: Props) {
  const user = await requirePermission('players.read');
  const { uuid } = await params;
  if (!UUID_PATTERN.test(uuid)) notFound();

  const db = getGameDb();
  const player = await db.players.get(uuid);
  if (!player) notFound();

  const seeEconomy = can(user, 'economy.read');
  const seePermissions = can(user, 'permissions.read');
  const seeModeration = can(user, 'moderation.read');

  const [progression, memberships, allGroups, account, movements, reports, linkStatus] =
    await Promise.all([
      db.progression.of(uuid),
      seePermissions ? db.permissions.membershipsOf(uuid) : Promise.resolve([]),
      seePermissions ? db.permissions.groups() : Promise.resolve([]),
      seeEconomy ? db.economy.account(uuid) : Promise.resolve(null),
      seeEconomy ? db.economy.ledger({ playerUuid: uuid, pageSize: 8 }) : Promise.resolve(null),
      seeModeration ? db.moderation.reportCountsOf(uuid) : Promise.resolve(null),
      db.link.status(),
    ]);

  const ref = { uuid: player.uuid, name: player.name };
  const canAct = linkStatus.canEnqueue;
  const canGrant = canAct && can(user, 'permissions.write');
  const canPay = canAct && can(user, 'economy.write');
  const heldGroups = new Set(memberships.filter((m) => m.active).map((m) => m.groupId));
  const grantable = allGroups.filter((group) => !heldGroups.has(group.id));

  return (
    <PageStack>
      <PageHeader
        crumbsLabel="Fil d’Ariane"
        crumbs={[{ label: 'Joueurs', href: '/console/players' }, { label: player.name }]}
        leading={<Avatar name={player.name} size={64} />}
        title={player.name}
        meta={
          <>
            {player.online ? <Badge tone="success">En jeu</Badge> : <Badge>Hors ligne</Badge>}
            {player.primaryGroup ? (
              <GroupChip id={player.primaryGroup.id} color={player.primaryGroup.color} />
            ) : null}
          </>
        }
        description={<span className="font-mono text-[13px]">{player.uuid}</span>}
      />

      <StatGrid>
        <StatTile
          label="Solde"
          value={account ? formatCoins(account.balance) : EMPTY}
          hint={
            account
              ? `${formatNumber(account.rank)}${account.rank === 1 ? 'ʳᵉ' : 'ᵉ'} fortune du serveur`
              : seeEconomy
                ? 'Aucun compte'
                : 'Réservé à l’économie'
          }
        />
        <StatTile
          label="Dernière venue"
          value={player.online ? 'En jeu' : formatRelative(player.lastSeenAt)}
          hint={formatDateTime(player.lastSeenAt)}
        />
        <StatTile
          label="Badges"
          value={progression.badges ? formatNumber(progression.badges.count) : EMPTY}
        />
        <StatTile
          label="Signalements reçus"
          value={reports ? formatNumber(reports.received) : EMPTY}
          hint={
            reports
              ? `${formatNumber(reports.filed)} déposés par ce joueur`
              : 'Réservé à la modération'
          }
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Identité" />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Première venue', value: formatDateTime(player.firstSeenAt) },
                { label: 'Mode de jeu', value: gameModeLabel(player.gameMode) },
                {
                  label: 'Dernière position',
                  value: player.lastLocation ? (
                    <span className="tabular">
                      {player.lastLocation.world} · {Math.round(player.lastLocation.x)},{' '}
                      {Math.round(player.lastLocation.y)}, {Math.round(player.lastLocation.z)}
                    </span>
                  ) : (
                    EMPTY
                  ),
                },
                // L'adresse IP est une donnée personnelle : réservée à la modération.
                ...(seeModeration
                  ? [
                      {
                        label: 'Dernière adresse IP',
                        value: <span className="font-mono">{player.lastIp ?? EMPTY}</span>,
                      },
                    ]
                  : []),
                {
                  label: 'Éclats',
                  value: progression.shards === null ? EMPTY : formatNumber(progression.shards),
                },
              ]}
            />
          </CardBody>
        </Card>

        {seePermissions ? (
          <Card>
            <CardHeader
              title="Grades"
              actions={
                canGrant && grantable.length > 0 ? (
                  <GrantGroupDialog player={ref} groups={grantable.map(({ id }) => ({ id }))} />
                ) : null
              }
            />
            {memberships.length === 0 ? (
              <EmptyState
                title="Aucun grade"
                description="Ce joueur n’a que le grade par défaut du serveur."
              />
            ) : (
              <Table caption={`Grades de ${player.name}`}>
                <TableHead>
                  <HeaderCell>Grade</HeaderCell>
                  <HeaderCell>Échéance</HeaderCell>
                  <HeaderCell>Donné le</HeaderCell>
                  {canGrant ? <HeaderCell align="right">Action</HeaderCell> : null}
                </TableHead>
                <TableBody>
                  {memberships.map((membership) => (
                    <Row key={`${membership.groupId}:${membership.context ?? ''}`}>
                      <Cell>
                        <span className="flex flex-wrap items-center gap-2">
                          <GroupChip id={membership.groupId} color={membership.group?.color} href />
                          {membership.context ? <Badge>{membership.context}</Badge> : null}
                          {membership.active ? null : <Badge tone="warning">Échu</Badge>}
                        </span>
                      </Cell>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {membership.expiresAt ? formatDateTime(membership.expiresAt) : 'Sans fin'}
                      </Cell>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {formatDate(membership.grantedAt)}
                      </Cell>
                      {canGrant ? (
                        <Cell align="right">
                          {membership.context ? null : (
                            <RevokeGroupDialog player={ref} groupId={membership.groupId} />
                          )}
                        </Cell>
                      ) : null}
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : null}

        {seeEconomy ? (
          <Card>
            <CardHeader
              title="Derniers mouvements d’argent"
              actions={
                <>
                  <Link
                    href={`/console/economy?player=${player.uuid}`}
                    className={buttonClass({ size: 'sm', variant: 'ghost' })}
                  >
                    Tout voir
                  </Link>
                  {canPay ? <BalanceDialog player={ref} /> : null}
                </>
              }
            />
            {!movements || movements.rows.length === 0 ? (
              <EmptyState title="Aucun mouvement pour ce joueur" />
            ) : (
              <Table caption={`Derniers mouvements d’argent de ${player.name}`}>
                <TableHead>
                  <HeaderCell>Nature</HeaderCell>
                  <HeaderCell>Date</HeaderCell>
                  <HeaderCell align="right">Montant</HeaderCell>
                </TableHead>
                <TableBody>
                  {movements.rows.map((entry) => (
                    <Row key={entry.id}>
                      <Cell>
                        <span className="flex flex-col">
                          <span>{ledgerKindLabel(entry.kind)}</span>
                          {entry.reason ? (
                            <span className="text-fg-muted text-xs">{entry.reason}</span>
                          ) : null}
                        </span>
                      </Cell>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {formatDateTime(entry.at)}
                      </Cell>
                      <Cell align="right" numeric>
                        {formatSignedCoins(
                          entry.targetUuid === player.uuid ? entry.amount : -entry.amount,
                        )}
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Métiers" />
          {!progression.professions || progression.professions.length === 0 ? (
            <EmptyState title="Aucun métier commencé" />
          ) : (
            <Table caption={`Métiers de ${player.name}`}>
              <TableHead>
                <HeaderCell>Métier</HeaderCell>
                <HeaderCell align="right">Expérience</HeaderCell>
                <HeaderCell>Dernier gain</HeaderCell>
              </TableHead>
              <TableBody>
                {progression.professions.map((profession) => (
                  <Row key={profession.professionId}>
                    <Cell>{profession.professionId}</Cell>
                    <Cell align="right" numeric>
                      {formatNumber(profession.xp)}
                    </Cell>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {formatRelative(profession.updatedAt)}
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Progression" />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                {
                  label: 'Quêtes terminées',
                  value: progression.quests
                    ? `${formatNumber(progression.quests.completedQuests)} (${formatNumber(progression.quests.active.length)} en cours)`
                    : EMPTY,
                },
                {
                  label: 'Créatures tuées',
                  value: progression.kills ? formatNumber(progression.kills.total) : EMPTY,
                },
                {
                  label: 'Poissons pris',
                  value: progression.fishing
                    ? `${formatNumber(progression.fishing.totalCatches)} (${formatNumber(progression.fishing.species)} espèces)`
                    : EMPTY,
                },
                {
                  label: 'Cosmétiques possédés',
                  value: progression.cosmetics ? formatNumber(progression.cosmetics.owned) : EMPTY,
                },
                {
                  label: 'Donjons terminés',
                  value: progression.dungeons
                    ? formatNumber(progression.dungeons.totalCompletions)
                    : EMPTY,
                },
                {
                  label: 'Tours',
                  value:
                    progression.dungeons && progression.dungeons.towers.length > 0
                      ? progression.dungeons.towers
                          .map((tower) => `${tower.towerId} : palier ${tower.highestFloor}`)
                          .join(' · ')
                      : EMPTY,
                },
                {
                  label: 'Meilleur temps en donjon',
                  value:
                    progression.dungeons && progression.dungeons.records.length > 0
                      ? formatDuration(
                          Math.min(...progression.dungeons.records.map((r) => r.bestTimeMs)),
                        )
                      : EMPTY,
                },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </PageStack>
  );
}
