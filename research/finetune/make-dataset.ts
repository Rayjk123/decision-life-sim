// Turn sampled states + one label source into Unsloth decision-model rows ({state, questions, gold}).
//   npx tsx research/finetune/make-dataset.ts --source heuristic|d3|claude --mode hard|soft [--train-n 2000] [--name <set>]
// Writes research/finetune/data/sets/<name>/{train,val,test}.jsonl. Gold per question is either a label
// ("invest_index", a score position, true/false) or {probabilities: {...}} (soft). Score questions are keyed by
// position: spend level L is position L-1, invest share level i is position i.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: {
  source: { type: 'string', default: 'heuristic' },
  mode: { type: 'string', default: 'hard' },
  'train-n': { type: 'string' },
  name: { type: 'string' },
  states: { type: 'string', default: 'research/finetune/data/states.jsonl' },
} });
const name = a.name ?? `${a.source}-${a.mode}${a['train-n'] ? `-${a['train-n']}` : ''}`;
type Dist = Record<string, number>;
const rows = readFileSync(a.states!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// ---- label sources, all normalized to {question: distribution over the question's own option keys} ----
function fromHeuristic(r: any): Record<string, Dist> {
  const h = r.heuristic, out: Record<string, Dist> = { main: h.main };
  if (r.questions.invest_share && h.investShare) out.invest_share = h.investShare;
  if (r.questions.spend_level && h.spendLevel) out.spend_level = Object.fromEntries(Object.entries(h.spendLevel as Dist).map(([lv, p]) => [String(Number(lv) - 1), p]));
  if (r.questions.retire && typeof h.retire === 'number') out.retire = { true: h.retire, false: 1 - h.retire };
  return out;
}
function fromFile(file: string): Map<string, Record<string, Dist | string | number | boolean>> {
  if (!existsSync(file)) throw new Error(`no labels at ${file}`);
  return new Map(readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const j = JSON.parse(l); return [j.id, j.labels]; }));
}
const fileLabels = a.source === 'heuristic' ? null : fromFile(`research/finetune/data/labels/${a.source}.jsonl`);

const argmax = (d: Dist) => Object.entries(d).sort((x, y) => y[1] - x[1])[0]?.[0];
function gold(r: any): Record<string, unknown> | null {
  const raw = a.source === 'heuristic' ? fromHeuristic(r) : fileLabels!.get(r.id);
  if (!raw) return null;
  const g: Record<string, unknown> = {};
  for (const q of Object.keys(r.questions)) {
    const v = (raw as Record<string, any>)[q];
    if (v === undefined || v === null) continue;
    // a hard label straight from the file (Claude labels): a move id, a score position or a boolean
    if (typeof v !== 'object') { g[q] = v; continue; }
    const dist: Dist = v.probabilities ?? v;
    if (a.mode === 'soft') g[q] = { probabilities: dist };
    else { const top = argmax(dist); g[q] = r.questions[q].type === 'noul' ? top === 'true' : r.questions[q].type === 'score' ? Number(top) : top; }
  }
  return g.main === undefined ? null : g;
}

const dir = join('research/finetune/data/sets', name);
mkdirSync(dir, { recursive: true });
const summary: string[] = [];
for (const split of ['train', 'val', 'test']) {
  let out = rows.filter((r) => r.split === split).map((r) => ({ id: r.id, archetype: r.archetype, state: r.state, questions: r.questions, gold: gold(r) })).filter((x) => x.gold);
  if (split === 'train' && a['train-n']) out = out.slice(0, Number(a['train-n']));
  writeFileSync(join(dir, `${split}.jsonl`), out.map((x) => JSON.stringify(x)).join('\n') + '\n');
  summary.push(`${split} ${out.length}`);
}
console.log(`${name}: ${summary.join(', ')} → ${dir}`);
