import type { Cents } from './types.ts';

export const dollars = (d: number): Cents => Math.round(d * 100);
export const k = (thousands: number): Cents => Math.round(thousands * 100_000);

/** Monthly payment for an amortizing loan. */
export function amortizedPayment(principal: Cents, annualRate: number, months: number): Cents {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return Math.round(principal / months);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
}

/** "$41k", "$1.2M", "$840", "-$3k" */
export function fmt(c: Cents): string {
  const neg = c < 0;
  const d = Math.abs(c) / 100;
  let s: string;
  if (d >= 1_000_000) s = `$${(d / 1_000_000).toFixed(d >= 10_000_000 ? 0 : 1)}M`;
  else if (d >= 10_000) s = `$${Math.round(d / 1000)}k`;
  else if (d >= 1000) s = `$${(d / 1000).toFixed(1)}k`;
  else s = `$${Math.round(d)}`;
  return neg ? `-${s}` : s;
}

export const round = (n: number): Cents => Math.round(n);
