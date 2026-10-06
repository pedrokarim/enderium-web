'use client';

import {
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useState,
  useTransition,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import {
  Button,
  type ButtonVariant,
  Dialog,
  Field,
  Input,
  Notice,
  type NoticeTone,
  buttonClass,
} from '@enderium/ui';
import { type IntentProgress, readIntentProgress } from '@/app/console/actions';
import { intentStatus, resultCodeLabel } from '@/lib/labels';
import type { ActionState } from '@/server/intents';

type FieldErrors = Record<string, string>;
/** La dernière saisie, à remettre dans les champs après une erreur. */
type FieldValues = Record<string, string>;
type IntentAction = (state: ActionState, form: FormData) => Promise<ActionState>;

interface IntentDialogProps {
  trigger: { label: string; icon?: ReactNode; variant?: ButtonVariant; size?: 'sm' | 'md' };
  title: string;
  description: ReactNode;
  action: IntentAction;
  submit: { label: string; variant?: ButtonVariant };
  /** Valeurs fixes envoyées avec le formulaire (le joueur visé, par exemple). */
  hidden: Record<string, string>;
  /** Les champs propres à l'action ; reçoit les erreurs par champ et la dernière saisie. */
  children?: (errors: FieldErrors, values: FieldValues) => ReactNode;
}

const IDLE: ActionState = { status: 'idle' };

/**
 * Fenêtre d'une action de l'équipe. Elle demande toujours un motif, dépose
 * l'action, puis suit son exécution par le serveur : cliquer ne suffit pas à
 * dire « c'est fait ».
 */
export function IntentDialog({
  trigger,
  title,
  description,
  action,
  submit,
  hidden,
  children,
}: IntentDialogProps) {
  // Changer la clé remonte le formulaire : état vidé, nouvelle clé d'idempotence.
  const [attempt, setAttempt] = useState<string | null>(null);

  const open = () => setAttempt(crypto.randomUUID());
  const close = () => setAttempt(null);

  return (
    <>
      <Button variant={trigger.variant} size={trigger.size} onClick={open}>
        {trigger.icon}
        {trigger.label}
      </Button>
      <Dialog
        open={attempt !== null}
        onClose={close}
        title={title}
        description={description}
        closeLabel="Fermer"
      >
        {attempt ? (
          <IntentForm
            key={attempt}
            idempotencyKey={`console:${attempt}`}
            action={action}
            submit={submit}
            hidden={hidden}
            onCancel={close}
          >
            {children}
          </IntentForm>
        ) : null}
      </Dialog>
    </>
  );
}

interface IntentFormProps {
  idempotencyKey: string;
  action: IntentAction;
  submit: { label: string; variant?: ButtonVariant };
  hidden: Record<string, string>;
  onCancel: () => void;
  children?: (errors: FieldErrors, values: FieldValues) => ReactNode;
}

function IntentForm({
  idempotencyKey,
  action,
  submit,
  hidden,
  onCancel,
  children,
}: IntentFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const reasonId = useId();
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const values = state.status === 'error' ? (state.values ?? {}) : {};

  if (state.status === 'submitted') {
    return <IntentTracker intentId={state.intentId} onClose={onCancel} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {state.status === 'error' && !state.fieldErrors ? (
        <Notice tone="danger" role="alert" title={state.message} />
      ) : null}

      {children?.(errors, values)}

      <Field
        htmlFor={reasonId}
        label="Motif"
        hint="Gardé dans le journal des actions, avec votre nom."
        error={errors.reason}
      >
        <Input
          id={reasonId}
          name="reason"
          defaultValue={values.reason}
          required
          minLength={5}
          maxLength={200}
          autoComplete="off"
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? `${reasonId}-error` : `${reasonId}-hint`}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </Button>
        <Button type="submit" variant={submit.variant ?? 'primary'} disabled={pending}>
          {pending ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : null}
          {submit.label}
        </Button>
      </div>
    </form>
  );
}

const POLL_INTERVAL_MS = 1500;
/** Au-delà, on cesse d'interroger : le journal reste la référence. */
const POLL_LIMIT = 20;
const FINAL_STATUSES = new Set(['done', 'refused', 'failed', 'expired']);

const TONES: Record<string, NoticeTone> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

/** Suit une action déposée jusqu'à son résultat, puis rafraîchit la page. */
function IntentTracker({ intentId, onClose }: { intentId: string; onClose: () => void }) {
  const router = useRouter();
  const [progress, setProgress] = useState<IntentProgress | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [, startTransition] = useTransition();

  const finished = progress !== null && FINAL_STATUSES.has(progress.status);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      attempts += 1;
      const next = await readIntentProgress(intentId).catch(() => null);
      if (cancelled) return;
      if (next) setProgress(next);
      if (next && FINAL_STATUSES.has(next.status)) {
        refresh();
        return;
      }
      if (attempts >= POLL_LIMIT) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intentId, refresh]);

  const described = intentStatus(progress?.status ?? 'pending');
  const tone = TONES[described.tone] ?? 'info';

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">
        {finished ? (
          <Notice tone={tone} title={`Action ${described.label.toLowerCase()}`}>
            {progress.resultCode && progress.resultCode !== 'ok'
              ? resultCodeLabel(progress.resultCode)
              : 'Le serveur a appliqué la modification.'}
          </Notice>
        ) : gaveUp ? (
          <Notice tone="warning" title="Le serveur n’a pas encore répondu">
            L’action reste déposée. Si aucun serveur ne la prend dans les dix minutes, elle expirera
            sans être exécutée.
          </Notice>
        ) : (
          <Notice tone="info" title="Action déposée, en attente du serveur">
            Le serveur relève les actions toutes les cinq secondes.
          </Notice>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={`/console/journal/${intentId}`} className={buttonClass({ variant: 'ghost' })}>
          Voir dans le journal
        </Link>
        <Button variant="primary" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
