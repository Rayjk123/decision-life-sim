// Whole-world experiment: run the same seeds with different deciders and compare how distinct and
// sensible the archetypes end up.
//   npm run experiment                                   random vs heuristic, 3 seeds x 30 years (no model)
//   npm run experiment -- --deciders random,heuristic,kev --seeds 1 --years 10
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHETYPES, balanceSheet, heuristicDecider, home, rentals, type Decider, type DecisionRecord, type World } from '@dls/sim-core';
import { kevDecider } from './kev.ts';
import { runWorld } from './runner.ts';
import { randomDecider } from './random.ts';

const { values: a } = parseArgs({
  options: {
    deciders: { type: 'string', default: 'random,heuristic' },
    seeds: { type: 'string', default: '1,2,3' },
    years: { type: 'string', default: '30' },
    pop: { type: 'string', default: '200' },
    'kev-url': { type: 'string', default: process.env.KEV_URL ?? 'http://127.0.0.1:8009' },
    model: { type: 'string', default: process.env.KEV_MODEL ?? 'kev-latest' },
    out: { type: 'string', default: 'experiments' },
  },
});

const KINDS = ['nothing', 'invest_index', 'trade_stocks', 'pay_debt', 'buy_home', 'buy_rental', 'sell_rental', 'buy_car', 'start'];
const kindOf = (id: string) => (id.startsWith('start_') ? 'start' : id.startsWith('buy_home') ? 'buy_home' : id);

/** Signature behaviour per archetype: the share of its decisions that went to its "own" move. */
const SIGNATURE: Record<string, string[]> = {
  saver: ['nothing', 'pay_debt'], index: ['invest_index'], picker: ['trade_stocks'], re: ['buy_rental', 'buy_home'],
  biz: ['start'], spender: ['buy_car', 'nothing'], status: ['buy_home', 'buy_car'], fire: ['invest_index', 'pay_debt'], balanced: [],
};

function mix(decisions: DecisionRecord[], arch: Map<string, string>) {
  const out: Record<string, Record<string, number>> = {};
  for (const ar of ARCHETYPES) {
    const ds = decisions.filter((d) => arch.get(d.simId) === ar.key);
    out[ar.key] = Object.fromEntries(KINDS.map((k) => [k, ds.length ? ds.filter((d) => kindOf(d.picked) === k).length / ds.length : 0]));
  }
  return out;
}

/** Average distance between archetypes' decision mixes (0 = identical, 1 = no overlap). Higher = more distinct personalities. */
function separation(m: Record<string, Record<string, number>>): number {
  const keys = Object.keys(m);
  let total = 0, n = 0;
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    total += 0.5 * KINDS.reduce((s, k) => s + Math.abs(m[keys[i]][k] - m[keys[j]][k]), 0); n++;
  }
  return n ? total / n : 0;
}

function signatureRate(m: Record<string, Record<string, number>>): number {
  const rows = Object.entries(SIGNATURE).filter(([, ks]) => ks.length);
  return rows.reduce((s, [ar, ks]) => s + ks.reduce((t, k) => t + (m[ar]?.[k] ?? 0), 0), 0) / rows.length;
}

function outcomes(world: World) {
  const sims = world.sims;
  const med = (xs: number[]) => (xs.length ? [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] : 0);
  return {
    medianNetWorth: med(sims.map((s) => balanceSheet(s).netWorth)),
    ownHome: sims.filter((s) => !!home(s)).length / sims.length,
    rentalsPerSim: sims.reduce((t, s) => t + rentals(s).length, 0) / sims.length,
    bankruptcies: sims.reduce((t, s) => t + s.bankruptcies, 0),
  };
}

const deciderFor = (name: string): Decider =>
  name === 'random' ? randomDecider : name === 'heuristic' ? heuristicDecider
  : kevDecider({ url: a['kev-url']!, model: a.model, apiKey: process.env.KEV_API_KEY, timeoutMs: 120_000 });

const rows: Array<Record<string, unknown>> = [];
const months = Number(a.years) * 12;
for (const name of a.deciders!.split(',')) {
  for (const seed of a.seeds!.split(',').map(Number)) {
    const t0 = Date.now();
    const dir = join(a.out!, `seed-${seed}-${name}`);
    const res = await runWorld({ seed, pop: Number(a.pop), months, decider: deciderFor(name), outDir: dir });
    const arch = new Map<string, string>();
    for (const s of res.world.sims) arch.set(s.id, s.archetype);
    for (const h of res.world.hallOfFame) arch.set(h.simId, h.archetype);
    const m = mix(res.decisions, arch);
    const row = { decider: name, seed, separation: separation(m), signature: signatureRate(m), ...outcomes(res.world), seconds: (Date.now() - t0) / 1000, mix: m };
    rows.push(row);
    console.log(`${name.padEnd(10)} seed ${seed} · separation ${(row.separation * 100).toFixed(0)}% · signature moves ${(row.signature * 100).toFixed(0)}% · own home ${(row.ownHome * 100).toFixed(0)}% · bankruptcies ${row.bankruptcies} · ${row.seconds.toFixed(1)}s`);
  }
}

console.log('\nAverages by decider');
for (const name of a.deciders!.split(',')) {
  const rs = rows.filter((r) => r.decider === name);
  const avg = (k: string) => rs.reduce((s, r) => s + (r[k] as number), 0) / rs.length;
  console.log(`  ${name.padEnd(10)} separation ${(avg('separation') * 100).toFixed(0)}% · signature moves ${(avg('signature') * 100).toFixed(0)}% · own home ${(avg('ownHome') * 100).toFixed(0)}% · bankruptcies ${avg('bankruptcies').toFixed(1)}`);
}
mkdirSync(a.out!, { recursive: true });
const file = join(a.out!, `experiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(rows, null, 2));
console.log(`\nWrote ${file}`);
