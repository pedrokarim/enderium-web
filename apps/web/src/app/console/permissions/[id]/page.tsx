import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KeyRound, Users } from 'lucide-react';
import {
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
} from '@enderium/ui';
import { getGameDb, type InheritedPermissionNode, type PermissionNode } from '@enderium/game-db';
import { requirePermission } from '@/server/auth';
import {
  Actor,
  GroupChip,
  ListPagination,
  ModuleMissing,
  PlayerLink,
} from '@/components/console/common';
import { Expiry, PageOutOfRange } from '@/components/console/list-states';
import { EMPTY, formatDate, formatNumber, plural } from '@/lib/format';
import { segmentParam } from '@/lib/route-params';
import { type SearchParams, hrefWith, pageParam } from '@/lib/search-params';

/** Un identifiant de grade : lettres, chiffres, tiret, point, tiret bas. */
const GROUP_ID_PATTERN = /^[\w.-]{1,64}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
/** Ancre des membres : changer de page ne renvoie pas en haut de la fiche. */
const MEMBERS_ANCHOR = 'membres';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requirePermission('permissions.read');
  const id = segmentParam((await params).id, GROUP_ID_PATTERN);
  if (!id) return { title: 'Grade introuvable' };
  const group = await getGameDb().permissions.group(id);
  return { title: group ? `Grade ${group.id}` : 'Grade introuvable' };
}

type ColorOf = ReadonlyMap<string, string>;

/** Une suite de grades en liens ; un grade absent du catalogue reste écrit, sans lien. */
function GroupChips({ ids, colors }: { ids: string[]; colors: ColorOf }) {
  if (ids.length === 0) return <span className="text-fg-muted">Aucun</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <GroupChip key={id} id={id} color={colors.get(id)} href={colors.has(id)} />
      ))}
    </span>
  );
}

/** Tableau de droits ; avec `colors`, une colonne dit de quel grade chaque droit est hérité. */
function NodeTable({
  caption,
  nodes,
  colors,
}: {
  caption: string;
  nodes: Array<PermissionNode | InheritedPermissionNode>;
  colors?: ColorOf;
}) {
  return (
    <Table caption={caption}>
      <TableHead>
        <HeaderCell>Permission</HeaderCell>
        <HeaderCell>Effet</HeaderCell>
        {colors ? <HeaderCell>Hérité de</HeaderCell> : null}
        <HeaderCell>Contexte</HeaderCell>
        <HeaderCell>Échéance</HeaderCell>
      </TableHead>
      <TableBody>
        {nodes.map((node) => {
          const origin = 'fromGroupId' in node ? node.fromGroupId : '';
          return (
            <Row key={`${origin}:${node.permission}:${node.context ?? ''}`}>
              <Cell>
                <span className="block max-w-96 min-w-48 font-mono text-[13px] break-all">
                  {node.permission}
                </span>
              </Cell>
              <Cell>
                <Badge tone={node.value ? 'success' : 'danger'}>
                  {node.value ? 'Accordé' : 'Refusé'}
                </Badge>
              </Cell>
              {colors ? (
                <Cell>
                  <GroupChip id={origin} color={colors.get(origin)} href={colors.has(origin)} />
                </Cell>
              ) : null}
              <Cell>
                {node.context ? (
                  <Badge>{node.context}</Badge>
                ) : (
                  <span className="text-fg-muted">Partout</span>
                )}
              </Cell>
              <Cell>
                <Expiry expiresAt={node.expiresAt} expired={node.expired} />
              </Cell>
            </Row>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default async function PermissionGroupPage({ params, searchParams }: Props) {
  await requirePermission('permissions.read');
  const id = segmentParam((await params).id, GROUP_ID_PATTERN);
  if (!id) notFound();
  const page = pageParam((await searchParams).page);

  const db = getGameDb();
  if (!(await db.meta.hasModule('permissions'))) {
    return (
      <PageStack>
        <PageHeader
          crumbsLabel="Fil d’Ariane"
          crumbs={[{ label: 'Grades et permissions', href: '/console/permissions' }, { label: id }]}
          title={id}
        />
        <Card>
          <ModuleMissing module="Permissions" tables="perms_*" />
        </Card>
      </PageStack>
    );
  }

  const [group, groups, members] = await Promise.all([
    db.permissions.group(id),
    db.permissions.groups(),
    db.permissions.members(id, { page }),
  ]);
  if (!group) notFound();

  const colors: ColorOf = new Map(groups.map((candidate) => [candidate.id, candidate.color]));
  const basePath = `/console/permissions/${encodeURIComponent(group.id)}`;
  const membersHref = (target: number) =>
    `${hrefWith(basePath, {}, { page: target })}#${MEMBERS_ANCHOR}`;
  const meta = Object.entries(group.meta);
  const inheritedFrom = new Set(group.inheritedNodes.map((node) => node.fromGroupId)).size;

  return (
    <PageStack>
      <PageHeader
        crumbsLabel="Fil d’Ariane"
        crumbs={[
          { label: 'Grades et permissions', href: '/console/permissions' },
          { label: group.id },
        ]}
        title={group.id}
        meta={group.staff ? <Badge tone="primary">Équipe</Badge> : <Badge>Joueurs</Badge>}
        description={
          group.staff
            ? 'Grade d’équipe : ses droits, ceux qu’il hérite, et les joueurs qui le portent.'
            : 'Grade de joueur : ses droits, ceux qu’il hérite, et les joueurs qui le portent.'
        }
      />

      <StatGrid>
        <StatTile label="Poids" value={formatNumber(group.weight)} hint="Le plus haut l’emporte" />
        <StatTile
          label="Membres"
          value={formatNumber(group.memberCount)}
          hint="Appartenances en cours"
          icon={<Users size={16} aria-hidden />}
        />
        <StatTile
          label="Droits propres"
          value={formatNumber(group.nodes.length)}
          icon={<KeyRound size={16} aria-hidden />}
        />
        <StatTile
          label="Droits hérités"
          value={formatNumber(group.inheritedNodes.length)}
          hint={
            inheritedFrom > 0 ? `De ${plural(inheritedFrom, 'grade', 'grades')}` : 'Aucun héritage'
          }
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Héritage"
            description="Un grade reçoit les droits de tous ses ancêtres."
          />
          <CardBody>
            <DescriptionList
              items={[
                {
                  label: 'Parents directs',
                  value: <GroupChips ids={group.parents} colors={colors} />,
                },
                {
                  label: 'Tous les ancêtres, du plus proche au plus lointain',
                  value: <GroupChips ids={group.ancestors} colors={colors} />,
                },
                {
                  label: 'Grades qui héritent directement de celui-ci',
                  value: <GroupChips ids={group.children} colors={colors} />,
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Réglages"
            description="L’étiquette du grade en jeu, puis ses valeurs nommées."
          />
          <CardBody className="flex flex-col gap-4">
            <DescriptionList
              columns={2}
              items={[
                {
                  label: 'Préfixe',
                  value: group.prefix ? (
                    <span className="font-mono text-[13px] break-all">{group.prefix}</span>
                  ) : (
                    EMPTY
                  ),
                },
                {
                  label: 'Suffixe',
                  value: group.suffix ? (
                    <span className="font-mono text-[13px] break-all">{group.suffix}</span>
                  ) : (
                    EMPTY
                  ),
                },
                {
                  label: 'Couleur',
                  value: group.color ? (
                    <span className="flex items-center gap-2">
                      {COLOR_PATTERN.test(group.color) ? (
                        <span
                          aria-hidden
                          className="border-line inline-block size-3 shrink-0 border"
                          style={{ backgroundColor: group.color }}
                        />
                      ) : null}
                      <span className="font-mono text-[13px] break-all">{group.color}</span>
                    </span>
                  ) : (
                    EMPTY
                  ),
                },
              ]}
            />
            {meta.length === 0 ? (
              <p className="text-fg-muted text-[13px]">
                Aucune valeur nommée n’est posée sur ce grade.
              </p>
            ) : (
              <DescriptionList
                columns={2}
                items={meta.map(([key, value]) => ({
                  label: key,
                  value: <span className="font-mono text-[13px] break-all">{value}</span>,
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Droits propres"
          description="Les permissions posées sur ce grade lui-même."
        />
        {group.nodes.length === 0 ? (
          <EmptyState
            title="Aucun droit propre"
            description="Ce grade ne porte aucune permission en propre : tout ce qu’il permet vient de ses ancêtres."
          />
        ) : (
          <NodeTable caption={`Droits propres du grade ${group.id}`} nodes={group.nodes} />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Droits hérités"
          description="Les permissions reçues des ancêtres, l’ancêtre le plus proche d’abord."
        />
        {group.inheritedNodes.length === 0 ? (
          <EmptyState
            title="Aucun droit hérité"
            description={
              group.ancestors.length === 0
                ? 'Ce grade n’hérite d’aucun autre.'
                : 'Les ancêtres de ce grade ne portent aucune permission.'
            }
          />
        ) : (
          <NodeTable
            caption={`Droits hérités par le grade ${group.id}`}
            nodes={group.inheritedNodes}
            colors={colors}
          />
        )}
      </Card>

      <div id={MEMBERS_ANCHOR} className="scroll-mt-6">
        <Card>
          <CardHeader
            title="Membres"
            description="Les appartenances les plus récentes d’abord, échues comprises."
          />
          {members.total === 0 ? (
            <EmptyState
              icon={<Users size={20} aria-hidden />}
              title="Aucun membre"
              description="Aucun joueur n’a reçu ce grade."
            />
          ) : members.rows.length === 0 ? (
            <PageOutOfRange firstPageHref={membersHref(1)} />
          ) : (
            <>
              <p className="text-fg-muted px-4 pt-4 text-[13px]" role="status">
                {plural(members.total, 'appartenance', 'appartenances')}
              </p>
              <Table caption={`Membres du grade ${group.id}`}>
                <TableHead>
                  <HeaderCell>Joueur</HeaderCell>
                  <HeaderCell>Contexte</HeaderCell>
                  <HeaderCell>Échéance</HeaderCell>
                  <HeaderCell>Donné par</HeaderCell>
                  <HeaderCell>Donné le</HeaderCell>
                </TableHead>
                <TableBody>
                  {members.rows.map((member) => (
                    <Row key={`${member.playerUuid}:${member.context ?? ''}`}>
                      <Cell>
                        <PlayerLink uuid={member.playerUuid} name={member.playerName} showUuid />
                      </Cell>
                      <Cell>
                        {member.context ? (
                          <Badge>{member.context}</Badge>
                        ) : (
                          <span className="text-fg-muted">Partout</span>
                        )}
                      </Cell>
                      <Cell>
                        <Expiry expiresAt={member.expiresAt} expired={!member.active} />
                      </Cell>
                      <Cell>
                        <Actor uuid={member.grantedBy} name={member.grantedByName} />
                      </Cell>
                      <Cell className="text-fg-muted whitespace-nowrap">
                        {formatDate(member.grantedAt)}
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
              <ListPagination page={members} hrefFor={membersHref} />
            </>
          )}
        </Card>
      </div>
    </PageStack>
  );
}
