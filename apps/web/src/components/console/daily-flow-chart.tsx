'use client';

import { useState } from 'react';
import { cn } from '@enderium/ui';

export interface DailyFlowPoint {
  /** Libellé court du jour (« 4 oct. »). */
  label: string;
  /** Libellé complet, pour l'infobulle et le lecteur d'écran. */
  fullLabel: string;
  created: number;
  destroyed: number;
  /** Valeurs déjà mises en forme : le composant ne connaît pas la monnaie. */
  createdText: string;
  destroyedText: string;
}

interface DailyFlowChartProps {
  points: DailyFlowPoint[];
  /** Graduations de l'axe, de la plus haute à zéro, déjà mises en forme. */
  ticks: { value: number; text: string }[];
  labels: { created: string; destroyed: string };
}

/**
 * Pièces créées et détruites par jour : deux barres côte à côte par jour, sur
 * un seul axe. Chaque jour se survole et se parcourt au clavier ; les chiffres
 * exacts sont dans le tableau placé sous le graphique.
 */
export function DailyFlowChart({ points, ticks, labels }: DailyFlowChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const top = ticks[0]?.value ?? 1;
  // Une étiquette de jour sur N, pour qu'elles ne se chevauchent jamais.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const focused = active === null ? null : points[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ul className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          <li className="flex items-center gap-2">
            <span aria-hidden className="bg-chart-1 size-2 rounded-[2px]" />
            {labels.created}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="bg-chart-2 size-2 rounded-[2px]" />
            {labels.destroyed}
          </li>
        </ul>
        {/* Lecture du jour survolé : toujours au même endroit, rien ne saute. */}
        <p aria-live="polite" className="tabular text-fg-muted min-h-5 text-[13px]">
          {focused ? (
            <>
              <span className="text-fg font-medium">{focused.fullLabel}</span> ·{' '}
              {labels.created.toLowerCase()} {focused.createdText} ·{' '}
              {labels.destroyed.toLowerCase()} {focused.destroyedText}
            </>
          ) : null}
        </p>
      </div>

      <div className="flex gap-3">
        <div
          aria-hidden
          className="tabular text-fg-subtle flex h-48 flex-col justify-between text-right text-xs"
        >
          {ticks.map((tick) => (
            <span key={tick.value} className="first:-translate-y-1/2 last:translate-y-1/2">
              {tick.text}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
              {ticks.map((tick) => (
                <span key={tick.value} className="border-border border-t" />
              ))}
            </div>
            <ul
              className="absolute inset-0 flex items-stretch"
              onMouseLeave={() => setActive(null)}
            >
              {points.map((point, index) => (
                <li key={point.fullLabel} className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label={`${point.fullLabel} : ${labels.created.toLowerCase()} ${point.createdText}, ${labels.destroyed.toLowerCase()} ${point.destroyedText}`}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      'flex size-full items-end justify-center gap-0.5 rounded-[4px] px-0.5',
                      active === index && 'bg-surface-sunken',
                    )}
                  >
                    <Bar value={point.created} top={top} className="bg-chart-1" />
                    <Bar value={point.destroyed} top={top} className="bg-chart-2" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <ul aria-hidden className="text-fg-subtle flex pt-2 text-xs">
            {points.map((point, index) => (
              <li key={point.fullLabel} className="min-w-0 flex-1 text-center whitespace-nowrap">
                {index % labelEvery === 0 ? point.label : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Bar({ value, top, className }: { value: number; top: number; className: string }) {
  if (value <= 0) return <span className="w-full max-w-4" />;
  // Une valeur non nulle reste visible, même minuscule devant le maximum.
  const height = Math.max(1.5, (value / top) * 100);
  return (
    <span
      className={cn('w-full max-w-4 rounded-t-[4px]', className)}
      style={{ height: `${height}%` }}
    />
  );
}
