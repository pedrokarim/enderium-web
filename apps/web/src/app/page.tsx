import { redirect } from 'next/navigation';

/**
 * Le site public n'existe pas encore : la racine mène à la console, qui
 * renvoie elle-même vers la connexion si besoin.
 */
export default function HomePage() {
  redirect('/console');
}
