import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '../lib/cn';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<NoticeTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-info-soft text-info-fg', icon: <Info size={16} aria-hidden /> },
  success: { box: 'bg-success-soft text-success-fg', icon: <CircleCheck size={16} aria-hidden /> },
  warning: {
    box: 'bg-warning-soft text-warning-fg',
    icon: <TriangleAlert size={16} aria-hidden />,
  },
  danger: { box: 'bg-danger-soft text-danger-fg', icon: <CircleAlert size={16} aria-hidden /> },
};

interface NoticeProps {
  tone?: NoticeTone;
  title: string;
  children?: ReactNode;
  /** Action proposée à droite du message. */
  action?: ReactNode;
  /** `alert` pour une erreur qui vient d'arriver, `status` pour une information. */
  role?: 'alert' | 'status';
  className?: string;
}

/** Message en ligne sur fond léger. Le titre dit l'état en toutes lettres. */
export function Notice({ tone = 'info', title, children, action, role, className }: NoticeProps) {
  const style = tones[tone];
  return (
    <div
      role={role}
      className={cn(
        'border-line flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-2 p-4',
        style.box,
        className,
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-pixel text-base font-medium">{title}</p>
          {children ? <div className="text-[13px]">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
