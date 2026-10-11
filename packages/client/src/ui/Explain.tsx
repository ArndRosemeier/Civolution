import type { ReactNode } from 'react';
import type { Explained } from '@civolution/engine';

/** Breakdown of a number as tooltip text: one line per part. */
export function explainText(title: string, e: Explained, unit = ''): string {
  const lines = e.parts.map((p) => `${p.amount > 0 ? '+' : p.amount < 0 ? '−' : ''}${Math.abs(p.amount)}${unit} ${p.label}`);
  return `${title}: ${e.value}${unit}\n${lines.join('\n')}`;
}

/** Wraps content with a styled hover card showing how a number is made up (PLAN.md §10.2). */
export function Explain({ title, value, unit, children, className }: { title: string; value: Explained; unit?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`tip ${className ?? ''}`} data-tip={explainText(title, value, unit)}>
      {children}
    </span>
  );
}
