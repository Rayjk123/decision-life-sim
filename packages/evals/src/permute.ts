// Option-order bias probe: re-asks each golden scenario's main question under several option orders through Kev's
// /v1/systemone/permute endpoint and reports whether an option gains probability just by its position.
//   npm run eval:permute -- [--n 8] [--style words] [--kev-url http://127.0.0.1:8009]
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StateStyle } from '@dls/sim-core';
import { requestFor } from './build.ts';
import { loadGolden } from './suite.ts';

const { values: a } = parseArgs({
  options: {
    n: { type: 'string', default: '8' },
    style: { type: 'string', default: 'words' },
    'kev-url': { type: 'string', default: process.env.KEV_URL ?? 'http://127.0.0.1:8009' },
    model: { type: 'string', default: 'kev-latest' },
    out: { type: 'string', default: 'evals-results' },
  },
});

interface Run { order: string[]; probabilities: Record<string, number>; choice: string }
interface PermuteResponse { runs: Run[]; argmax_stable: boolean; spread: Record<string, number> }

const { scenarios } = loadGolden();
const nPerm = Number(a.n);
const rows: Array<{ id: string; options: number; stable: boolean; nothingFirst: number; nothingElse: number; nothingLast: number; firstLift: number; maxSpread: number; choices: string[] }> = [];

for (const sc of scenarios) {
  const req = requestFor(sc, a.style as StateStyle);
  const res = await fetch(`${a['kev-url']!.replace(/\/$/, '')}/v1/systemone/permute`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request: { model: a.model, state: req.state, questions: { main: (req.questions as Record<string, unknown>).main } }, question: 'main', n_perm: nPerm, seed: 1 }),
  });
  if (!res.ok) throw new Error(`${sc.id}: HTTP ${res.status} ${await res.text()}`);
  const r = (await res.json()) as PermuteResponse;
  const k = r.runs[0].order.length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
  const pNothing = (pred: (pos: number) => boolean) => avg(r.runs.filter((x) => pred(x.order.indexOf('nothing'))).map((x) => x.probabilities.nothing));
  // first-position lift: for every option, p when listed first / its mean p over all orders; averaged over options seen first
  const lifts: number[] = [];
  for (const opt of r.runs[0].order) {
    const mean = avg(r.runs.map((x) => x.probabilities[opt]));
    const first = r.runs.filter((x) => x.order[0] === opt).map((x) => x.probabilities[opt]);
    if (first.length && mean > 0) lifts.push(avg(first) / mean);
  }
  rows.push({
    id: sc.id, options: k, stable: r.argmax_stable,
    nothingFirst: pNothing((p) => p === 0), nothingElse: pNothing((p) => p > 0), nothingLast: pNothing((p) => p === k - 1),
    firstLift: avg(lifts), maxSpread: Math.max(...Object.values(r.spread)), choices: r.runs.map((x) => x.choice),
  });
  process.stdout.write('.');
}

const f = (x: number) => (Number.isNaN(x) ? '  -  ' : x.toFixed(3));
console.log(`\n\nscenario              opts stable  p(nothing) first / not first / last   first-pos lift  max spread`);
for (const r of rows) console.log(`${r.id.padEnd(22)}${String(r.options).padStart(4)}  ${r.stable ? 'yes' : 'NO '}     ${f(r.nothingFirst)}  /  ${f(r.nothingElse)}  /  ${f(r.nothingLast)}        ${f(r.firstLift)}       ${f(r.maxSpread)}`);
const mean = (key: 'nothingFirst' | 'nothingElse' | 'nothingLast' | 'firstLift' | 'maxSpread') => { const xs = rows.map((r) => r[key]).filter((x) => !Number.isNaN(x)); return xs.reduce((s, v) => s + v, 0) / xs.length; };
const topNothing = rows.flatMap((r) => r.choices).filter((c) => c === 'nothing').length / rows.flatMap((r) => r.choices).length;
console.log(`\nmean p(nothing): first ${f(mean('nothingFirst'))} · not first ${f(mean('nothingElse'))} · last ${f(mean('nothingLast'))}`);
console.log(`mean first-position lift ${f(mean('firstLift'))} (1.000 = no bias) · mean max spread ${f(mean('maxSpread'))}`);
console.log(`argmax stable in ${rows.filter((r) => r.stable).length}/${rows.length} scenarios · "nothing" is the top pick in ${(topNothing * 100).toFixed(0)}% of all ${rows.length * nPerm} orders`);

mkdirSync(a.out!, { recursive: true });
const file = join(a.out!, `permute-${a.style}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(rows, null, 2));
console.log(`Wrote ${file}`);
