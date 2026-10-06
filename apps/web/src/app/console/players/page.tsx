import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, UserSearch } from 'lucide-react';
import {
  Button,
  Card,
  Cell,
  EmptyState,
  HeaderCell,
  Input,
  PageHeader,
  PageStack,
  Row,
  Select,
  StatusDot,
  Table,
  TableBody,
  TableHead,
  buttonClass,
} from '@enderium/ui';
import { getGameDb, type PlayerSort } from '@enderium/game-db';
import { can, requirePermission } from '@/server/auth';
import { GroupChip, ListPagination, PlayerLink } from '@/components/console/common';
import { EMPTY, formatCoins, formatDate, formatRelative, plural } from '@/lib/format';
import {
  type SearchParams,
  choiceParam,
  firstParam,
  hrefWith,
  pageParam,
} from '@/lib/search-params';

export const metadata: Metadata = { title: 'Joueurs' };

const SORTS: readonly PlayerSort[] = ['lastSeen', 'name', 'firstSeen', 'balance'];
const SORT_LABELS: Record<PlayerSort, string> = {
  lastSeen: 'Dernière venue',
  name: 'Pseudo',
  firstSeen: 'Première venue',
  balance: 'Solde',
};

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('players.read');
  const params = await searchParams;
  const search = firstParam(params.q)?.slice(0, 64);
  const page = pageParam(params.page);
  const seeBalances = can(user, 'economy.read');
  // Trier par solde révèle l'ordre des fortunes : réservé à qui peut les lire.
  const requestedSort = choiceParam(params.sort, SORTS) ?? 'lastSeen';
  const sort = requestedSort === 'balance' && !seeBalances ? 'lastSeen' : requestedSort;

  const players = await getGameDb().players.list({ search, sort, page });
  const filters = { q: search, sort: sort === 'lastSeen' ? undefined : sort };

  return (
    <PageStack>
      <PageHeader
        title="Joueurs"
        description="Toutes les personnes venues au moins une fois sur le serveur."
      />

      <Card>
        <form
          method="GET"
          role="search"
          className="border-border flex flex-wrap items-end gap-3 border-b p-4"
        >
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
            <label htmlFor="player-search" className="text-fg text-[13px] font-medium">
              Rechercher
            </label>
            <Input
              id="player-search"
              type="search"
              name="q"
              defaultValue={search}
              maxLength={64}
              placeholder="Pseudo ou UUID complet"
              autoComplete="off"
            />
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-48">
            <label htmlFor="player-sort" className="text-fg text-[13px] font-medium">
              Trier par
            </label>
            <Select id="player-sort" name="sort" defaultValue={sort}>
              {SORTS.filter((choice) => choice !== 'balance' || seeBalances).map((choice) => (
                <option key={choice} value={choice}>
                  {SORT_LABELS[choice]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="primary">
            <Search size={16} aria-hidden />
            Rechercher
          </Button>
          {search ? (
            <Link href="/console/players" className={buttonClass({ variant: 'ghost' })}>
              Effacer
            </Link>
          ) : null}
        </form>

        {players.rows.length === 0 ? (
          <EmptyState
            icon={<UserSearch size={20} aria-hidden />}
            title={search ? `Aucun joueur ne correspond à « ${search} »` : 'Aucun joueur'}
            description={
              search
                ? 'La recherche porte sur le pseudo actuel. Un UUID doit être complet, avec ses tirets.'
                : 'Un joueur apparaît ici à sa première connexion.'
            }
          />
        ) : (
          <>
            <p className="text-fg-muted px-4 pt-4 text-[13px]" role="status">
              {plural(players.total, 'joueur', 'joueurs')}
            </p>
            <Table caption="Liste des joueurs">
              <TableHead>
                <HeaderCell>Joueur</HeaderCell>
                <HeaderCell>Grade</HeaderCell>
                {seeBalances ? <HeaderCell align="right">Solde</HeaderCell> : null}
                <HeaderCell>Dernière venue</HeaderCell>
                <HeaderCell>Première venue</HeaderCell>
              </TableHead>
              <TableBody>
                {players.rows.map((player) => (
                  <Row key={player.uuid}>
                    <Cell>
                      <PlayerLink uuid={player.uuid} name={player.name} showUuid />
                    </Cell>
                    <Cell>
                      {player.primaryGroup ? (
                        <GroupChip id={player.primaryGroup.id} color={player.primaryGroup.color} />
                      ) : (
                        <span className="text-fg-muted">{EMPTY}</span>
                      )}
                    </Cell>
                    {seeBalances ? (
                      <Cell align="right" numeric>
                        {player.balance === null ? EMPTY : formatCoins(player.balance)}
                      </Cell>
                    ) : null}
                    <Cell className="whitespace-nowrap">
                      {player.online ? (
                        <span className="flex items-center gap-2">
                          <StatusDot tone="success" />
                          En jeu
                        </span>
                      ) : (
                        <span className="text-fg-muted">{formatRelative(player.lastSeenAt)}</span>
                      )}
                    </Cell>
                    <Cell className="text-fg-muted whitespace-nowrap">
                      {formatDate(player.firstSeenAt)}
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
            <ListPagination
              page={players}
              hrefFor={(target) => hrefWith('/console/players', filters, { page: target })}
            />
          </>
        )}
      </Card>
    </PageStack>
  );
}
