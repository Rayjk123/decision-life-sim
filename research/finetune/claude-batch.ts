// Print a batch of sampled states compactly, for Claude to label by the rubric (docs/finetune/labeling-rubric.md).
//   npx tsx research/finetune/claude-batch.ts --batch 0 [--size 40]
// The labelling set is a fixed, archetype-stratified subset (train 1,200 / val 200 / test 300) chosen by a keyed
// shuffle, so batches are stable across sessions. Labels go to research/finetune/data/labels/claude/batch-<n>.jsonl
// as {"id", "labels": {"main", "invest_share"?, "spend_level"?, "retire"?}, "why"}; spend_level is a position (level-1).
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rngFor } from '@dls/sim-core';

const { values: a } = parseArgs({ options: { batch: { type: 'string', default: '0' }, size: { type: 'string', default: '40' }, list: { type: 'boolean', default: false }, pool: { type: 'string', default: 'core' } } });
const rows = readFileSync('research/finetune/data/states.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const QUOTA: Record<string, number> = { train: 1200, val: 200, test: 300 };

// Archetype-stratified, keyed selection per split
const chosen: any[] = [];
for (const [split, n] of Object.entries(QUOTA)) {
  const pool = rows.filter((r) => r.split === split);
  const byArch = new Map<string, any[]>();
  for (const r of pool) byArch.set(r.archetype, [...(byArch.get(r.archetype) ?? []), r]);
  const rng = rngFor(7, 'claude-label-set', split);
  for (const list of byArch.values()) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  // round-robin across archetypes so every archetype is represented in proportion (spenders aren't drowned out)
  const queues = [...byArch.values()];
  const picked: any[] = [];
  for (let k = 0; picked.length < n && queues.some((q) => q.length); k++) { const q = queues[k % queues.length]; if (q.length) picked.push(q.shift()); }
  chosen.push(...picked);
}
// --pool extra: every train state NOT in the core set, in a stable keyed order (for labelling the whole train split
// without renumbering the core batches: core train 0-29, val 30-34, test 35-42).
if (a.pool === 'extra') {
  const core = new Set(chosen.map((r) => r.id));
  const extra = rows.filter((r) => r.split === 'train' && !core.has(r.id));
  const rng = rngFor(7, 'claude-label-extra');
  for (let i = extra.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [extra[i], extra[j]] = [extra[j], extra[i]]; }
  chosen.length = 0; chosen.push(...extra);
}
const size = Number(a.size);
const batches = Math.ceil(chosen.length / size);
if (a.list) { console.log(`${chosen.length} states in ${batches} batches of ${size}`); process.exit(0); }
const b = Number(a.batch);
const short = (s: unknown) => String(s ?? '').replace(/ a year/g, '/yr').replace(/ a month/g, '/mo').replace(/last month/g, 'last mo');
for (const r of chosen.slice(b * size, (b + 1) * size)) {
  const s = r.state, q = r.questions;
  const moves = r.moves.map((m: any) => `${m.id}: ${m.description}`).join(' | ');
  const asks = [q.invest_share ? 'invest_share(0-4)' : null, q.spend_level ? 'spend(1-10)' : null, q.retire ? 'RETIRE?' : null].filter(Boolean).join(' ');
  console.log(`\n### ${r.id} [${r.split}] ${r.archetype} age ${r.age} (${r.reason})`);
  console.log(`who: ${short(s.person)} | ${s.personality}`);
  console.log(`traits: ${s.traits}`);
  console.log(`money: ${short(s.money)} | debts: ${s.debts} | ${short(s.monthly)} | ${short(s.housing)} | ${s.property} | biz: ${s.business}`);
  console.log(`economy: ${short(s.market)} | town: ${s.town} | recent: ${s.recent}`);
  console.log(`MOVES: ${moves}`);
  console.log(`ASK: main ${asks}`);
}
console.log(`\n(${a.pool === 'extra' ? 'extra ' : ''}batch ${b} of ${batches - 1})`);
