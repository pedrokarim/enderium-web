import { StatusDot } from '@enderium/ui';
import { getGameDb, type ServerHeartbeat } from '@enderium/game-db';
import { plural } from '@/lib/format';

export interface LinkSnapshot {
  /** La base du jeu a répondu. */
  reachable: boolean;
  /** Le plugin EnderiumLink a créé ses tables. */
  installed: boolean;
  servers: ServerHeartbeat[];
}

/**
 * Ne lève jamais : la coquille de la console doit s'afficher même quand la
 * base ne répond pas, pour que la page puisse dire ce qui ne va pas.
 */
export async function loadLinkSnapshot(): Promise<LinkSnapshot> {
  try {
    const link = getGameDb().link;
    const [installed, servers] = await Promise.all([link.available(), link.servers()]);
    return { reachable: true, installed, servers };
  } catch (cause) {
    console.error('Lecture de l’état du serveur impossible :', cause);
    return { reachable: false, installed: false, servers: [] };
  }
}

/** État du serveur de jeu dans la barre du haut : toujours un point ET un texte. */
export function ServerStatus({ snapshot }: { snapshot: LinkSnapshot }) {
  const online = snapshot.servers.filter((server) => server.online);
  const players = online.reduce((sum, server) => sum + server.onlinePlayers, 0);

  let tone: 'success' | 'danger' | 'neutral' = 'neutral';
  let text = 'Lien avec le serveur non installé';
  if (!snapshot.reachable) {
    tone = 'danger';
    text = 'Base du jeu injoignable';
  } else if (snapshot.installed) {
    if (online.length > 0) {
      tone = 'success';
      text = `Serveur en ligne · ${plural(players, 'joueur', 'joueurs')}`;
    } else {
      tone = 'danger';
      text = 'Serveur hors ligne';
    }
  }

  return (
    <p role="status" className="text-fg-muted flex min-w-0 items-center gap-2 px-2 text-[13px]">
      <StatusDot tone={tone} />
      <span className="truncate">{text}</span>
    </p>
  );
}
