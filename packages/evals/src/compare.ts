// Compare two eval runs (a new one against a recorded baseline): headline deltas, a regression verdict, and every
// scenario and counterfactual pair that flipped between pass and fail.
//   npm run eval:compare -- <new.json> [--against docs/results/data/d3-4b-words.json] [--tolerance 0.02]
// Accepts either one run object or the array `npm run eval` writes (the first run with matching style is used).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface EvalRun {
  model?: string; decider?: string; style: string;
  summary: { overall: number; pairPass: number; scenarioScore: number; scenarioPass: number };
  scenarios: Array<{ id: string; grade: { pass: boolean; top?: string } }>;
  pairs: Array<{ id: string; grade: { pass: boolean; delta?: number } }>;
}

export interface Comparison {
  deltas: Record<'overall' | 'pairPass' | 'scenarioScore', number>;
  regressed: string[];                                   // headline metrics that dropped by more than the tolerance
  flips: Array<{ kind: 'scenario' | 'pair'; id: string; was: boolean; now: boolean; detail: string }>;
}

export function compareRuns(now: EvalRun, base: EvalRun, tolerance = 0.02): Comparison {
  const keys = ['overall', 'pairPass', 'scenarioScore'] as const;
  const deltas = Object.fromEntries(keys.map((k) => [k, now.summary[k] - base.summary[k]])) as Comparison['deltas'];
  const regressed = keys.filter((k) => deltas[k] < -tolerance);
  const flips: Comparison['flips'] = [];
  for (const s of now.scenarios) {
    const b = base.scenarios.find((x) => x.id === s.id);
    if (b && b.grade.pass !== s.grade.pass) flips.push({ kind: 'scenario', id: s.id, was: b.grade.pass, now: s.grade.pass, detail: `top ${b.grade.top ?? '?'} → ${s.grade.top ?? '?'}` });
  }
  for (const p of now.pairs) {
    const b = base.pairs.find((x) => x.id === p.id);
    const d = (x?: number) => (x === undefined ? '?' : `${x >= 0 ? '+' : ''}${x.toFixed(3)}`);
    if (b && b.grade.pass !== p.grade.pass) flips.push({ kind: 'pair', id: p.id, was: b.grade.pass, now: p.grade.pass, detail: `${d(b.grade.delta)} → ${d(p.grade.delta)}` });
  }
  return { deltas, regressed, flips };
}

export function loadRun(file: string, style?: string): EvalRun {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const runs: EvalRun[] = Array.isArray(j) ? j : [j];
  const r = style ? runs.find((x) => x.style === style) ?? runs[0] : runs[0];
  if (!r?.summary || !Array.isArray(r.scenarios)) throw new Error(`${file} is not an eval run`);
  return r;
}

export function formatComparison(c: Comparison, nowLabel: string, baseLabel: string): string {
  const pts = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pts`;
  const lines = [`${nowLabel} vs ${baseLabel}: overall ${pts(c.deltas.overall)} · pairs ${pts(c.deltas.pairPass)} · scenario score ${pts(c.deltas.scenarioScore)}`];
  for (const f of c.flips) lines.push(`  ${f.now ? '✅ now passes' : '❌ now fails '} ${f.kind.padEnd(8)} ${f.id.padEnd(24)} ${f.detail}`);
  if (!c.flips.length) lines.push('  no scenario or pair changed pass/fail');
  lines.push(c.regressed.length ? `REGRESSION: ${c.regressed.join(', ')} dropped beyond tolerance` : 'no regression');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const against = flag('--against') ?? 'docs/results/data/d3-4b-words.json';
  const tolerance = Number(flag('--tolerance') ?? 0.02);
  if (!args[0]) { console.error('usage: npm run eval:compare -- <new.json> [--against <baseline.json>] [--tolerance 0.02]'); process.exit(2); }
  const base = loadRun(against);
  const now = loadRun(args[0], base.style);
  const c = compareRuns(now, base, tolerance);
  console.log(formatComparison(c, `${now.model ?? now.decider ?? args[0]} (${now.style})`, `${base.model ?? base.decider ?? against} (${base.style})`));
  process.exit(c.regressed.length ? 1 : 0);
}
