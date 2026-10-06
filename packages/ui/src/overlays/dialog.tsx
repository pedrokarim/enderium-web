'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { buttonClass } from '../primitives/button';

interface DialogProps {
  /** La fenêtre est ouverte tant que cette valeur est vraie. */
  open: boolean;
  /**
   * Demande de fermeture, quelle qu'en soit la cause (bouton, Échap). Le
   * parent y repasse `open` à faux.
   */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  closeLabel: string;
  children: ReactNode;
}

/**
 * Fenêtre modale sur l'élément natif `<dialog>` : piège du focus, touche Échap
 * et retour du focus au déclencheur sont ceux du navigateur.
 */
export function Dialog({ open, onClose, title, description, closeLabel, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      className="border-line bg-bg text-fg shadow-overlay bevel m-auto w-[min(32rem,calc(100vw-2rem))] border-2 p-0"
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="font-pixel text-fg text-lg font-medium">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-fg-muted text-[13px]">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className={buttonClass({ variant: 'ghost', size: 'sm', iconOnly: true })}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
