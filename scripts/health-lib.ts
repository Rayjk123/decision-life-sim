// Pure metrics and checks for scripts/health.ts (the G7 sim-health gate), kept separate for unit tests.
import { ageInt, balanceSheet, home, inSchool, type SimEvent, type World } from '@dls/sim-core';

export interface HealthMetrics {
  population: number;
  bankruptcyPerSimYear: number;     // bankrupt events / sim-years lived
  homeownership35plus: number;      // share of living sims aged 35+ who own their home
  unemployment: number;             // share of the labour force (not in school, not retired, not self-employed) without a job
  medianNetWorth: number;           // dollars, living adults
  gini: number;                     // net worth inequality among living adults (negatives clipped to 0)
  medianRetirementAge: number;      // from 'retired' events; NaN when nobody retired
}

const median = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function gini(values: number[]): number {
  const xs = values.map((v) => Math.max(0, v)).sort((a, b) => a - b);
  const n = xs.length, total = xs.reduce((s, v) => s + v, 0);
  if (n < 2 || total === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * xs[i];
  return (2 * cum) / (n * total) - (n + 1) / n;
}

export function healthMetrics(world: World, events: SimEvent[], simMonths: number): HealthMetrics {
  const m = world.month;
  const adults = world.sims.filter((s) => !inSchool(s, m));
  const older = world.sims.filter((s) => ageInt(s, m) >= 35);
  const labour = adults.filter((s) => !s.retired && !s.selfEmployed);
  const retireAges = events.filter((e) => e.type === 'retired').map((e) => {
    const sim = world.sims.find((s) => s.id === e.simId);
    return sim ? ageInt(sim, e.month) : NaN;
  }).filter((x) => !Number.isNaN(x));
  return {
    population: world.sims.length,
    bankruptcyPerSimYear: events.filter((e) => e.type === 'bankrupt').length / Math.max(1, simMonths / 12),
    homeownership35plus: older.length ? older.filter((s) => home(s)).length / older.length : 0,
    unemployment: labour.length ? labour.filter((s) => !s.employed).length / labour.length : 0,
    medianNetWorth: median(adults.map((s) => balanceSheet(s).netWorth / 100)),
    gini: gini(adults.map((s) => balanceSheet(s).netWorth)),
    medianRetirementAge: median(retireAges),
  };
}

// Structural invariants over the whole world: every number finite, money in integer cents, no negative debts or assets.
export function integrityViolations(world: World): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${path} is ${v}`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(world, 'world');
  for (const s of world.sims) {
    if (!Number.isInteger(s.cash)) out.push(`${s.id}.cash ${s.cash} is not whole cents`);
    for (const l of s.loans) if (l.balance < 0 || !Number.isInteger(l.balance)) out.push(`${s.id} ${l.kind} loan balance ${l.balance}`);
    for (const a of s.assets) if (a.value < 0) out.push(`${s.id} ${a.kind} value ${a.value}`);
    if (s.index < 0 || s.stocks < 0) out.push(`${s.id} negative holdings index ${s.index} stocks ${s.stocks}`);
  }
  return out.slice(0, 20);
}

export type Band = [number, number];
export function outOfBand(metrics: Record<string, number>, bands: Record<string, Band>): string[] {
  return Object.entries(bands)
    .filter(([k, [lo, hi]]) => !(metrics[k] >= lo && metrics[k] <= hi))
    .map(([k, [lo, hi]]) => `${k} ${metrics[k]} outside [${lo}, ${hi}]`);
}
