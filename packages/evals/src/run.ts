// Run the eval suite.
//   npm run eval                                  heuristic and random baselines (no model needed)
//   npm run eval -- --decider kev                 Kev on :8009, default "words" state style
//   npm run eval -- --decider kev --style all     compare words / numbers / terse
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { heuristicDecider, type Decider, type StateStyle } from '@dls/sim-core';
import { kevDecider } from '@dls/worker/src/kev.ts';
import { randomDecider, runSuite, type SuiteResult } from './suite.ts';

const { values: a } = parseArgs({
  options: {
    decider: { type: 'string', default: 'baselines' },  // baselines | heuristic | random | kev
    style: { type: 'string', default: 'words' },        // words | numbers | terse | all
    'kev-url': { type: 'string', default: process.env.KEV_URL ?? 'http://127.0.0.1:8009' },
    model: { type: 'string', default: process.env.KEV_MODEL ?? 'kev-latest' },
    out: { type: 'string', default: 'evals-results' },
    verbose: { type: 'boolean', default: false },
  },
});

const styles: StateStyle[] = a.style === 'all' ? ['words', 'numbers', 'terse', 'focused'] : [a.style as StateStyle];
const deciders: Decider[] =
  a.decider === 'baselines' ? [randomDecider, heuristicDecider]
  : a.decider === 'random' ? [randomDecider]
  : a.decider === 'heuristic' ? [heuristicDecider]
  : [kevDecider({ url: a['kev-url']!, model: a.model, apiKey: process.env.KEV_API_KEY, timeoutMs: 120_000 })];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const results: SuiteResult[] = [];
for (const d of deciders) for (const style of d.name === 'kev' ? styles : ['words' as StateStyle]) {
  const t0 = Date.now();
  const r = await runSuite(d, style, d.name === 'kev' ? 8 : 1);
  results.push(r);
  console.log(`\n${d.name} · ${style} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  overall ${pct(r.summary.overall)} · scenario score ${pct(r.summary.scenarioScore)} · scenarios passed ${pct(r.summary.scenarioPass)} · top pick in character ${pct(r.summary.topAccuracy)} · stayed out of avoid ${pct(r.summary.avoidRate)} · pairs passed ${pct(r.summary.pairPass)}`);
  for (const [cat, c] of Object.entries(r.summary.byCategory)) console.log(`  ${cat.padEnd(12)} n=${c.n}  score ${pct(c.score)}  pass ${pct(c.pass)}`);
  if (a.verbose) {
    for (const s of r.scenarios) console.log(`  ${s.grade.pass ? 'PASS' : 'fail'} ${s.scenario.id.padEnd(20)} top ${s.grade.top.padEnd(18)} best ${pct(s.grade.bestMass).padStart(4)} avoid ${pct(s.grade.avoidMass).padStart(4)}${s.grade.retireOk === null ? '' : ` retire ${s.answers.retire?.toFixed(2)}`}`);
    for (const p of r.pairs) console.log(`  ${p.grade.pass ? 'PASS' : 'fail'} ${p.pair.id.padEnd(24)} ${p.grade.base.toFixed(3)} -> ${p.grade.variant.toFixed(3)} (${p.grade.delta >= 0 ? '+' : ''}${p.grade.delta.toFixed(3)}, want ${p.pair.direction})`);
  }
}

mkdirSync(a.out!, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const tag = a.decider === "kev" ? `kev-${a.model!.replace(/[^\w.-]+/g, "_")}` : a.decider;
const file = join(a.out!, `eval-${tag}-${a.style}-${stamp}.json`);
writeFileSync(file, JSON.stringify(results.map((r) => ({
  decider: r.decider, model: r.decider === "kev" ? a.model : undefined, style: r.style, summary: r.summary,
  scenarios: r.scenarios.map((s) => ({ id: s.scenario.id, grade: s.grade, answers: s.answers })),
  pairs: r.pairs.map((p) => ({ id: p.pair.id, grade: p.grade })),
})), null, 2));
const md = [`# Eval results · ${new Date().toISOString()}`, '', '| decider | style | overall | scenario score | passed | top pick in character | avoided | pairs |', '|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.decider} | ${r.style} | ${pct(r.summary.overall)} | ${pct(r.summary.scenarioScore)} | ${pct(r.summary.scenarioPass)} | ${pct(r.summary.topAccuracy)} | ${pct(r.summary.avoidRate)} | ${pct(r.summary.pairPass)} |`)].join('\n');
writeFileSync(file.replace(/\.json$/, '.md'), md + '\n');
console.log(`\nWrote ${file} and the .md summary`);
