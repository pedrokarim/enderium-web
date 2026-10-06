import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { Button, Card, CardBody, Field, Notice, Select, buttonClass } from '@enderium/ui';
import { getSession, getSignInOptions } from '@/server/auth';
import { CenteredPage } from '@/components/centered-page';
import type { SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Connexion' };
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const options = getSignInOptions(await searchParams);
  if (!options.misconfigured && (await getSession())) redirect(options.returnTo);

  return (
    <CenteredPage
      title="Console d’Enderium"
      description="Réservée à l’équipe du serveur. La connexion passe par Ascencia ID."
    >
      {options.signedOut ? (
        <Notice tone="success" role="status" title="Vous êtes déconnecté" />
      ) : null}
      {options.errorMessage ? (
        <Notice tone="danger" role="alert" title="La connexion a échoué">
          {options.errorMessage}
        </Notice>
      ) : null}
      {options.misconfigured ? (
        <Notice tone="danger" role="alert" title="Le site est mal configuré">
          Aucune connexion n’est possible pour l’instant. Le détail est dans le journal du serveur
          du site.
        </Notice>
      ) : null}

      {!options.misconfigured ? (
        <Card>
          <CardBody className="flex flex-col gap-4">
            {options.ascencia.configured ? (
              // Un lien ordinaire : la connexion marche sans JavaScript.
              <a
                href={options.ascencia.href}
                className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}
              >
                <LogIn size={16} aria-hidden />
                Se connecter avec Ascencia ID
              </a>
            ) : (
              <Notice tone="warning" title="Ascencia ID n’est pas configuré">
                Les variables ASCENCIA_* manquent dans l’environnement du site.
              </Notice>
            )}

            {options.devAuth.enabled ? (
              <form
                method="POST"
                action={options.devAuth.action}
                className="border-border flex flex-col gap-4 border-t pt-4"
              >
                <input type="hidden" name="returnTo" value={options.returnTo} />
                <Field
                  htmlFor="dev-profile"
                  label="Connexion locale de développement"
                  hint="Ouverte par ENDERIUM_DEV_AUTH=1, jamais en production."
                >
                  <Select id="dev-profile" name="profile" aria-describedby="dev-profile-hint">
                    {options.devAuth.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" size="lg" className="w-full">
                  Entrer en développeur local
                </Button>
              </form>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </CenteredPage>
  );
}
