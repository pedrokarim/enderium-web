import type { Metadata } from 'next';
import Link from 'next/link';
import { Filter, ScrollText, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Cell,
  EmptyState,
  HeaderCell,
  PageHeader,
  PageStack,
  Row,
  Select,
  Table,
  TableBody,
  TableHead,
  buttonClass,
} from '@enderium/ui';
import { getGameDb } from '@enderium/game-db';
import { requirePermission } from '@/server/auth';
import { Actor, GroupChip, ListPagination, ModuleMissing } from '@/components/console/common';
import { LogDetail, PageOutOfRange } from '@/components/console/list-states';
import { EMPTY, formatDateTime, formatNumber, plural } from '@/lib/format';
import { permissionActionCodes, permissionActionLabel } from '@/lib/labels';
import { type SearchParams, firstParam, hrefWith, pageParam } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Grades et permissions' };

const BASE_PATH = '/console/permissions';
/** Ancre du journal : filtrer ou changer de page ne renvoie pas en haut de l'écran. */
const LOG_ANCHOR = 'journal';
/** Un code d'action du journal (`member.add`, `group-add`, `import`). */
const ACTION_PATTERN = /^[a-z][a-z0-9._-]{0,31}$/;
/** Nombre de valeurs nommées montrées dans la liste ; la fiche les donne toutes. */
const META_PREVIEW = 3;

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('permissions.read');
  const params = await searchParams;
  const page = pageParam(params.page);
  const requestedAction = firstParam(params.action);
  const action =
    requestedAction && ACTION_PATTERN.test(requestedAction) ? requestedAction : undefined;

  const header = (
    <PageHeader
      title="Grades et permissions"
      description="Les grades du serveur, du poids le plus haut au plus bas, et le journal de ce qui a changé."
    />
  );

  const db = getGameDb();
  if (!(await db.meta.hasModule('permissions'))) {
    return (
      <PageStack>
        {header}
        <Card>
          <ModuleMissing module="Permissions" tables="perms_*" />
        </Card>
      </PageStack>
    );
  }

  const [groups, log] = await Promise.all([
    db.permissions.groups(),
    db.permissions.log({ action, page }),
  ]);

  const colors = new Map(groups.map((group) => [group.id, group.color]));
  const filters = { action };
  const logHref = (changes: Record<string, string | number | undefined>) =>
    `${hrefWith(BASE_PATH, filters, changes)}#${LOG_ANCHOR}`;
  // Le filtre propose les actions connues du site, plus celle de l'adresse si elle est autre.
  const knownActions = permissionActionCodes();
  const actionChoices =
    action && !knownActions.includes(action) ? [...knownActions, action] : knownActions;

  return (
    <PageStack>
      {header}

      <Card>
        <CardHeader
          title="Grades"
          description="Le poids trie les grades et tranche entre deux grades d’un même joueur."
        />
        {groups.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={20} aria-hidden />}
            title="Aucun grade"
            description="Les grades sont recopiés en base au démarrage du serveur, depuis le catalogue du jeu."
          />
        ) : (
          <>
            <p className="text-fg-muted px-4 pt-4 text-[13px]" role="status">
              {plural(groups.length, 'grade', 'grades')}
            </p>
            <Table caption="Liste des grades, du poids le plus haut au plus bas">
              <TableHead>
                <HeaderCell>Grade</HeaderCell>
                <HeaderCell align="right">Poids</HeaderCell>
                <HeaderCell>Hérite de</HeaderCell>
                <HeaderCell align="right">Membres</HeaderCell>
                <HeaderCell>Valeurs nommées</HeaderCell>
              </TableHead>
              <TableBody>
                {groups.map((group) => {
                  const meta = Object.entries(group.meta);
                  return (
                    <Row key={group.id}>
                      <Cell>
                        <span className="flex items-center gap-2">
                          <GroupChip id={group.id} color={group.color} href />
                          {group.staff ? <Badge tone="primary">Équipe</Badge> : null}
                        </span>
                      </Cell>
                      <Cell align="right" numeric>
                        {formatNumber(group.weight)}
                      </Cell>
                      <Cell>
                        {group.parents.length === 0 ? (
                          <span className="text-fg-muted">{EMPTY}</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {group.parents.map((parent) => (
                              <GroupChip
                                key={parent}
                                id={parent}
                                color={colors.get(parent)}
                                href={colors.has(parent)}
                              />
                            ))}
                          </span>
                        )}
                      </Cell>
                      <Cell align="right" numeric>
                        {formatNumber(group.memberCount)}
                      </Cell>
                      <Cell>
                        {meta.length === 0 ? (
                          <span className="text-fg-muted">{EMPTY}</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            {meta.slice(0, META_PREVIEW).map(([key, value]) => (
                              <Badge key={key} className="max-w-48">
                                <span className="truncate font-mono">
                                  {key} = {value}
                                </span>
                              </Badge>
                            ))}
                            {meta.length > META_PREVIEW ? (
                              <span className="text-fg-muted text-xs whitespace-nowrap">
                                et {formatNumber(meta.length - META_PREVIEW)} de plus
                              </span>
                            ) : null}
                          </span>
                        )}
                      </Cell>
                    </Row>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      <div id={LOG_ANCHOR} className="scroll-mt-6">
        <Card>
          <CardHeader
            title="Journal des permissions"
            description="Chaque changement de grade ou de droit, du plus récent au plus ancien."
          />
          <form
            method="GET"
            action={`${BASE_PATH}#${LOG_ANCHOR}`}
            className="border-border flex flex-wrap items-end gap-3 border-b p-4"
          >
            <div className="flex w-full flex-col gap-2 sm:w-64">
              <label htmlFor="log-action" className="text-fg text-[13px] font-medium">
                Action
              </label>
              <Select id="log-action" name="action" defaultValue={action ?? ''}>
                <option value="">Toutes les actions</option>
                {actionChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {permissionActionLabel(choice)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="primary">
              <Filter size={16} aria-hidden />
              Filtrer
            </Button>
            {action ? (
              <Link
                href={`${BASE_PATH}#${LOG_ANCHOR}`}
                className={buttonClass({ variant: 'ghost' })}
              >
                Effacer
              </Link>
            ) : null}
          </form>

          {log.total === 0 ? (
            <EmptyState
              icon={<ScrollText size={20} aria-hidden />}
              title={
                action
                  ? `Aucune ligne pour l’action « ${permissionActionLabel(action)} »`
                  : 'Le journal est vide'
              }
              description={
                action
                  ? 'Le journal ne contient aucun changement de cette nature.'
                  : 'Une ligne s’ajoute à chaque grade donné ou retiré, et à chaque droit modifié.'
              }
            />
          ) : log.rows.length === 0 ? (
            <PageOutOfRange firstPageHref={logHref({ page: 1 })} />
          ) : (
            <>
              <p className="text-fg-muted px-4 pt-4 text-[13px]" role="status">
                {plural(log.total, 'ligne', 'lignes')}
              </p>
              <Table caption="Journal des permissions">
                <TableHead>
                  <HeaderCell>Date</HeaderCell>
                  <HeaderCell>Action</HeaderCell>
                  <HeaderCell>Cible</HeaderCell>
                  <HeaderCell>Détail</HeaderCell>
                  <HeaderCell>Auteur</HeaderCell>
                </TableHead>
                <TableBody>
                  {log.rows.map((entry) => (
                    <Row key={entry.id}>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {formatDateTime(entry.at)}
                      </Cell>
                      <Cell className="whitespace-nowrap">
                        {ACTION_PATTERN.test(entry.action) ? (
                          <Link
                            href={logHref({ action: entry.action, page: 1 })}
                            className="rounded-field hover:underline"
                          >
                            {permissionActionLabel(entry.action)}
                          </Link>
                        ) : (
                          permissionActionLabel(entry.action)
                        )}
                      </Cell>
                      <Cell>
                        {entry.targetType === 'group' ? (
                          // Un grade supprimé depuis n'a plus de fiche : pas de lien.
                          <GroupChip
                            id={entry.targetId}
                            color={colors.get(entry.targetId)}
                            href={colors.has(entry.targetId)}
                          />
                        ) : entry.targetType === 'player' ? (
                          <Actor uuid={entry.targetId} name={entry.targetName} />
                        ) : (
                          <span className="font-mono text-[13px] break-all">{entry.targetId}</span>
                        )}
                      </Cell>
                      <Cell>
                        <LogDetail detail={entry.detail} reason={entry.reason} />
                      </Cell>
                      <Cell>
                        <Actor uuid={entry.actorUuid} name={entry.actorName} />
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
              <ListPagination page={log} hrefFor={(target) => logHref({ page: target })} />
            </>
          )}
        </Card>
      </div>
    </PageStack>
  );
}
