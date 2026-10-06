import type { Metadata } from 'next';
import Link from 'next/link';
import { Coins, Hourglass, Radio, Users } from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  Cell,
  EmptyState,
  HeaderCell,
  Notice,
  PageHeader,
  PageStack,
  Row,
  StatGrid,
  StatTile,
  StatusDot,
  Table,
  TableBody,
  TableHead,
  buttonClass,
} from '@enderium/ui';
import { getGameDb } from '@enderium/game-db';
import { can, requirePermission } from '@/server/auth';
import { PlayerLink } from '@/components/console/common';
import {
  EMPTY,
  formatCoins,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatSignedCoins,
} from '@/lib/format';
import { ledgerKindLabel } from '@/lib/labels';

export const metadata: Metadata = { title: 'Vue d’ensemble' };

const MOVEMENT_SIGN = { creation: 1, destruction: -1, transfer: 0 } as const;

export default async function OverviewPage() {
  const user = await requirePermission('console.access');
  const db = getGameDb();
  const seePlayers = can(user, 'players.read');
  const seeEconomy = can(user, 'economy.read');
  const seeJournal = can(user, 'journal.read');

  const [linkStatus, servers, playerCount, online, recent, economy, movements, pending, modules] =
    await Promise.all([
      db.link.status(),
      db.link.servers(),
      db.players.count(),
      db.players.onlineEstimate(),
      seePlayers ? db.players.recentlySeen(6) : Promise.resolve([]),
      seeEconomy ? db.economy.overview() : Promise.resolve(null),
      seeEconomy ? db.economy.ledger({ pageSize: 6 }) : Promise.resolve(null),
      seeJournal ? db.link.intents.list({ status: 'pending', pageSize: 1 }) : Promise.resolve(null),
      db.meta.modules(),
    ]);

  const onlineServers = servers.filter((server) => server.online);

  return (
    <PageStack>
      <PageHeader
        title="Vue d’ensemble"
        description="L’état du serveur et de sa base, lu à l’instant."
      />

      {!linkStatus.tables ? (
        <Notice tone="warning" title="La console est en lecture seule">
          Le plugin EnderiumLink n’a pas encore créé ses tables dans cette base : aucune action ne
          peut être envoyée au serveur, et son état n’est pas connu.
        </Notice>
      ) : linkStatus.secret !== 'ok' ? (
        <Notice tone="warning" title="La console est en lecture seule">
          {linkStatus.secret === 'missing'
            ? 'Aucun secret de lien n’est configuré côté site (ENDERIUM_LINK_SECRET) : aucune action ne peut être signée.'
            : 'Le secret de lien fait moins de 32 octets : le serveur le refuserait.'}
        </Notice>
      ) : onlineServers.length === 0 ? (
        <Notice tone="danger" title="Aucun serveur ne répond">
          Les actions déposées maintenant attendront dix minutes, puis expireront sans être
          exécutées.
        </Notice>
      ) : null}

      <StatGrid>
        <StatTile
          label="Joueurs inscrits"
          value={formatNumber(playerCount)}
          icon={<Users size={16} aria-hidden />}
        />
        <StatTile
          label="Connectés"
          value={formatNumber(online.count)}
          hint={
            online.source === 'heartbeat'
              ? 'D’après le battement du serveur'
              : 'Estimation, faute de lien avec le serveur'
          }
          icon={<Radio size={16} aria-hidden />}
        />
        <StatTile
          label="Masse monétaire"
          value={economy ? formatCoins(economy.moneySupply) : EMPTY}
          hint={
            economy
              ? `${formatNumber(economy.accounts)} comptes`
              : seeEconomy
                ? 'Module Économie absent'
                : 'Réservé à l’économie'
          }
          icon={<Coins size={16} aria-hidden />}
        />
        <StatTile
          label="Actions en attente"
          value={pending ? formatNumber(pending.total) : EMPTY}
          hint={pending ? 'Déposées, pas encore exécutées' : 'Réservé au journal'}
          icon={<Hourglass size={16} aria-hidden />}
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Serveurs" description="Un battement toutes les quinze secondes." />
          {servers.length === 0 ? (
            <EmptyState
              title="Aucun serveur connu"
              description="Un serveur apparaît ici dès que son plugin EnderiumLink a démarré."
            />
          ) : (
            <Table caption="Serveurs de jeu et leur état">
              <TableHead>
                <HeaderCell>Serveur</HeaderCell>
                <HeaderCell>État</HeaderCell>
                <HeaderCell align="right">Joueurs</HeaderCell>
                <HeaderCell align="right">TPS</HeaderCell>
                <HeaderCell>Version</HeaderCell>
              </TableHead>
              <TableBody>
                {servers.map((server) => (
                  <Row key={server.serverId}>
                    <Cell className="font-medium">{server.serverId}</Cell>
                    <Cell>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <StatusDot tone={server.online ? 'success' : 'danger'} />
                        {server.online ? 'En ligne' : `Vu ${formatRelative(server.seenAt)}`}
                      </span>
                    </Cell>
                    <Cell align="right" numeric>
                      {server.onlinePlayers} / {server.maxPlayers}
                    </Cell>
                    <Cell align="right" numeric>
                      {server.tps.toFixed(2).replace('.', ',')}
                    </Cell>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {server.minecraftVersion} · {server.pluginVersion}
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Modules de la base"
            description="Les tables que chaque plugin a créées."
          />
          <ul className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
            {modules.map((module) => (
              <li key={module.id} className="flex items-center justify-between gap-3">
                <span className="text-fg truncate text-sm">{module.id}</span>
                {module.available ? (
                  <Badge tone="success">
                    Présent{module.schemaVersion !== null ? ` · v${module.schemaVersion}` : ''}
                  </Badge>
                ) : (
                  <Badge>Absent</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {seePlayers ? (
          <Card>
            <CardHeader
              title="Derniers joueurs vus"
              actions={
                <Link href="/console/players" className={buttonClass({ size: 'sm' })}>
                  Tous les joueurs
                </Link>
              }
            />
            {recent.length === 0 ? (
              <EmptyState title="Aucun joueur pour l’instant" />
            ) : (
              <Table caption="Derniers joueurs vus sur le serveur">
                <TableHead>
                  <HeaderCell>Joueur</HeaderCell>
                  <HeaderCell>Dernière venue</HeaderCell>
                </TableHead>
                <TableBody>
                  {recent.map((player) => (
                    <Row key={player.uuid}>
                      <Cell>
                        <PlayerLink uuid={player.uuid} name={player.name} />
                      </Cell>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {player.online ? 'En jeu' : formatRelative(player.lastSeenAt)}
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : null}

        {seeEconomy && movements ? (
          <Card>
            <CardHeader
              title="Derniers mouvements d’argent"
              actions={
                <Link href="/console/economy" className={buttonClass({ size: 'sm' })}>
                  Économie
                </Link>
              }
            />
            {movements.rows.length === 0 ? (
              <EmptyState title="Aucun mouvement enregistré" />
            ) : (
              <Table caption="Derniers mouvements du journal de l’économie">
                <TableHead>
                  <HeaderCell>Nature</HeaderCell>
                  <HeaderCell>Date</HeaderCell>
                  <HeaderCell align="right">Montant</HeaderCell>
                </TableHead>
                <TableBody>
                  {movements.rows.map((entry) => (
                    <Row key={entry.id}>
                      <Cell>{ledgerKindLabel(entry.kind)}</Cell>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {formatDateTime(entry.at)}
                      </Cell>
                      <Cell align="right" numeric>
                        {MOVEMENT_SIGN[entry.movement] === 0
                          ? formatNumber(entry.amount)
                          : formatSignedCoins(MOVEMENT_SIGN[entry.movement] * entry.amount)}
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : null}
      </div>
    </PageStack>
  );
}
