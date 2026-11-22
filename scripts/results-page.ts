// Regenerates the tables in docs/results.md from docs/results/data/*.json.
//   npm run docs:results
// To add a run: copy its evals-results/eval-*.json entry into docs/results/data/<model>-<style>.json (one run per file,
// with a "model" field), add the model to MODELS below, then run this script.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'docs', 'results', 'data');
const PAGE = join(ROOT, 'docs', 'results.md');

// display order; params and where each ran
const MODELS: Record<string, { label: string; params: string; host: string }> = {
  random: { label: 'Random', params: '–', host: 'CPU' },
  heuristic: { label: 'Heuristic', params: '–', host: 'CPU' },
  'kev-0.8b': { label: 'Kev-0.8B', params: '0.8B', host: 'Mac M3 Pro (MLX)' },
  'kev-4b': { label: 'Kev-4B', params: '4B (LoRA)', host: 'Mac M3 Pro (MLX)' },
  'd3-2b': { label: 'd3:2b', params: '2.4B Q8_0', host: 'RTX 4070 Super (Ollama)' },
  'd3-4b': { label: 'd3:4b', params: '4.8B Q8_0', host: 'RTX 4070 Super (Ollama)' },
};

interface Grade { pass: boolean; top?: string; delta?: number }
interface Run {
  model: string; style: string;
  summary: { overall: number; scenarioScore: number; scenarioPass: number; topAccuracy: number; avoidRate: number; pairPass: number; byCategory: Record<string, { n: number; score: number; pass: number }> };
  scenarios: Array<{ id: string; grade: Grade }>;
  pairs: Array<{ id: string; grade: Grade }>;
}

const runs: Run[] = readdirSync(DATA).filter((f) => f.endsWith('.json') && !f.startsWith('permute'))
  .map((f) => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as Run)
  .sort((a, b) => Object.keys(MODELS).indexOf(a.model) - Object.keys(MODELS).indexOf(b.model) || b.summary.overall - a.summary.overall);

const pct = (x: number) => `${Math.round(x * 100)}%`;
const best = new Map<string, Run>();
for (const r of runs) if (!best.has(r.model) || r.summary.overall > best.get(r.model)!.summary.overall) best.set(r.model, r);
const cols = Object.keys(MODELS).filter((m) => best.has(m));
const head = (first: string) => `| ${first} | ${cols.map((m) => `${MODELS[m].label}<br><sub>${best.get(m)!.style}</sub>`).join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|`;

const leaderboard = [
  '| Model | Params | Ran on | State style | **Overall** | Scenario score | Top pick in character | Stayed out of avoid | Personality pass | **Pairs** |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...runs.map((r) => {
    const m = MODELS[r.model] ?? { label: r.model, params: '?', host: '?' };
    const isBest = best.get(r.model) === r;
    const b = (s: string) => (isBest ? `**${s}**` : s);
    return `| ${b(m.label)} | ${m.params} | ${m.host} | ${r.style}${isBest ? ' ★' : ''} | ${b(pct(r.summary.overall))} | ${pct(r.summary.scenarioScore)} | ${pct(r.summary.topAccuracy)} | ${pct(r.summary.avoidRate)} | ${pct(r.summary.byCategory.personality?.pass ?? 0)} | ${b(pct(r.summary.pairPass))} |`;
  }),
].join('\n');

const pairIds = best.get('heuristic')?.pairs.map((p) => p.id) ?? runs[0].pairs.map((p) => p.id);
const pairs = [head('Counterfactual pair'), ...pairIds.map((id) => `| \`${id}\` | ${cols.map((m) => {
  const g = best.get(m)!.pairs.find((p) => p.id === id)?.grade;
  if (!g) return '–';
  const d = g.delta === undefined ? '' : ` ${g.delta >= 0 ? '+' : ''}${g.delta.toFixed(2)}`;
  return `${g.pass ? '✅' : '❌'}${d}`;
}).join(' | ')} |`), `| **Passed** | ${cols.map((m) => `**${best.get(m)!.pairs.filter((p) => p.grade.pass).length}/${best.get(m)!.pairs.length}**`).join(' | ')} |`].join('\n');

const scIds = runs[0].scenarios.map((s) => s.id);
const scenarios = [head('Scenario'), ...scIds.map((id) => `| \`${id}\` | ${cols.map((m) => {
  const g = best.get(m)!.scenarios.find((s) => s.id === id)?.grade;
  return g ? `${g.pass ? '✅' : '❌'} ${g.top ?? ''}` : '–';
}).join(' | ')} |`), `| **Passed** | ${cols.map((m) => `**${best.get(m)!.scenarios.filter((s) => s.grade.pass).length}/${best.get(m)!.scenarios.length}**`).join(' | ')} |`].join('\n');

const data = readdirSync(DATA).filter((f) => f.endsWith('.json')).sort().map((f) => `[\`${f}\`](results/data/${f})`).join(' · ');

const blocks: Record<string, string> = { leaderboard, pairs, scenarios, data };
let page = readFileSync(PAGE, 'utf8');
for (const [name, body] of Object.entries(blocks)) {
  const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`);
  if (!re.test(page)) throw new Error(`docs/results.md is missing the generated:${name} markers`);
  page = page.replace(re, `$1\n\n${body}\n\n$2`);   // blank lines: kramdown (GitHub Pages) treats a table right after an HTML comment as a paragraph
}
writeFileSync(PAGE, page);
console.log(`Updated ${PAGE}: ${runs.length} runs, ${cols.length} models`);
