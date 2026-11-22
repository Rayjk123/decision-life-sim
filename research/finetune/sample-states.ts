// Sample real decision requests from simulated towns: the dataset every training run and label source shares.
//   npx tsx research/finetune/sample-states.ts [--per-seed 90] [--out research/finetune/data/states.jsonl]
// Splits by world seed (train 101-140, val 141-150, test 151-160), so no test state comes from a town seen in training.
// Each row is exactly what a decision model receives (state + questions), plus the legal moves, context, and the
// heuristic's answers (one of the label sources). Sampling is keyed, so the file is reproducible byte for byte.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { ageInt, createWorld, heuristicDecider, rngFor, runMonth, type Decider, type DecisionRequest } from '@dls/sim-core';

const { values: a } = parseArgs({ options: {
  'per-seed': { type: 'string', default: '90' },
  out: { type: 'string', default: 'research/finetune/data/states.jsonl' },
  // --deals: only train/val states where the archetype's signature deal is on offer (the main set almost never has one
  // the rubric would take, so a student never learns to take it). Keyed separately, so these are new states.
  deals: { type: 'boolean', default: false },
} });
const perSeed = Number(a['per-seed']);
const SPLITS: Array<[string, number[]]> = [
  ['train', Array.from({ length: 40 }, (_, i) => 101 + i)],
  ['val', Array.from({ length: 10 }, (_, i) => 141 + i)],
  ['test', Array.from({ length: 10 }, (_, i) => 151 + i)],
];

export interface StateRow {
  id: string; split: string; seed: number; month: number; simId: string; archetype: string; age: number; reason: string;
  state: Record<string, unknown>; questions: Record<string, unknown>;
  moves: Array<{ id: string; kind: string; description: string }>;
  heuristic: { main: Record<string, number>; investShare?: Record<string, number>; retire?: number; spendLevel?: Record<string, number> };
}

const rows: StateRow[] = [];
const DEAL: Record<string, RegExp> = { re: /^buy_rental$/, biz: /^start_/, status: /^(buy_home|buy_car)/, spender: /^buy_car$/ };
for (const [split, seeds] of SPLITS) {
  if (a.deals && split === 'test') continue;
  for (const seed of seeds) {
    const world = createWorld(seed, 150);
    const captured: Array<{ req: DecisionRequest; reason: string }> = [];
    // A pass-through decider that records requests (the heuristic still drives the town)
    const recorder: Decider = {
      name: 'heuristic',
      async decide(req) { captured.push({ req, reason: '' }); return heuristicDecider.decide(req); },
    };
    while (world.month < 40 * 12) {
      captured.length = 0;
      const r = await runMonth(world, recorder);
      r.decisions.forEach((d) => { const c = captured.find((x) => x.req.sim.id === d.simId); if (c) c.reason = d.reason; });
      for (const { req, reason } of captured) {
        if (req.moves.length < 2) continue;
        // keep roughly perSeed of the ~15,000 decisions a 150-sim town makes in 40 years (keyed, so reproducible)
        if (a.deals) {
          const deal = DEAL[req.sim.archetype];
          if (!deal || !req.moves.some((mv) => deal.test(mv.id))) continue;
          if (!rngFor(seed, 'sample-deals', world.month, req.sim.id).chance(perSeed / 1000)) continue;
        } else if (!rngFor(seed, 'sample', world.month, req.sim.id).chance(perSeed / 15000)) continue;
        const h = await heuristicDecider.decide(req);
        rows.push({
          id: `${seed}-${world.month}-${req.sim.id}`, split, seed, month: world.month, simId: req.sim.id,
          archetype: req.sim.archetype, age: ageInt(req.sim, world.month), reason,
          state: req.state, questions: req.questions as Record<string, unknown>,
          moves: req.moves.map((mv) => ({ id: mv.id, kind: mv.kind, description: mv.description })),
          heuristic: h.answers as StateRow['heuristic'],
        });
      }
    }
    process.stderr.write(`${split} seed ${seed}: ${rows.filter((x) => x.seed === seed).length} states\n`);
  }
}
mkdirSync(dirname(a.out!), { recursive: true });
writeFileSync(a.out!, rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
const count = (k: (x: StateRow) => string) => Object.entries(rows.reduce<Record<string, number>>((t, x) => ((t[k(x)] = (t[k(x)] ?? 0) + 1), t), {})).sort().map(([kk, v]) => `${kk} ${v}`).join(', ');
console.log(`${rows.length} states → ${a.out}\n  by split: ${count((x) => x.split)}\n  by archetype: ${count((x) => x.archetype)}\n  moves offered (avg): ${(rows.reduce((t, x) => t + x.moves.length, 0) / rows.length).toFixed(1)}`);
