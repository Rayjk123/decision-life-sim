// Run the world from the command line.
//   npm run sim -- --months 600 --pop 200                     heuristic mode, no model needed
//   npm run sim -- --decider kev --months 24 --pop 200        uses the Kev server on localhost:8009
//   npm run sim -- --decider kev --months 120 --resume        continue from the latest yearly snapshot
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { heuristicDecider, type Decider, type StateStyle } from '@dls/sim-core';
import { kevDecider, percentile } from './kev.ts';
import { monthLabel } from './store.ts';
import { runWorld, worldDir } from './runner.ts';
import { archetypeTable, decisionMix } from './report.ts';

const { values: a } = parseArgs({
  options: {
    months: { type: 'string', default: '600' },
    pop: { type: 'string', default: '200' },
    seed: { type: 'string', default: '1' },
    decider: { type: 'string', default: 'heuristic' },          // heuristic | kev
    'kev-url': { type: 'string', default: process.env.KEV_URL ?? 'http://127.0.0.1:8009' },
    model: { type: 'string', default: process.env.KEV_MODEL ?? 'kev-latest' },
    policy: { type: 'string', default: 'events' },               // events | monthly
    style: { type: 'string', default: 'words' },                 // words | numbers | terse
    concurrency: { type: 'string', default: '8' },
    out: { type: 'string', default: 'world' },
    resume: { type: 'boolean', default: false },
    'report-every': { type: 'string', default: '120' },
    quiet: { type: 'boolean', default: false },
  },
});

const seed = Number(a.seed);
// a non-default model gets its own world folder (seed-1-d3), so a d3 run never lands in seed-1-kev
const label = a.decider === 'kev' && a.model !== 'kev-latest' ? a.model!.replace(/[^\w.-]+/g, '_') : a.decider!;
const out = worldDir(a.out!, seed, label);
let decider: Decider = heuristicDecider;
let kev: ReturnType<typeof kevDecider> | undefined;
if (a.decider === 'kev') {
  kev = kevDecider({ url: a['kev-url']!, model: a.model, apiKey: process.env.KEV_API_KEY, cacheFile: join(out, 'kev-cache.ndjson') });
  decider = kev;
}

const t0 = Date.now();
console.log(`decision-life-sim · seed ${seed} · ${a.pop} sims · ${a.months} months · decider ${decider.name}${a.decider === 'kev' ? ` (model ${a.model})` : ''} · policy ${a.policy} · style ${a.style} · out ${out}`);
const res = await runWorld({
  seed, pop: Number(a.pop), months: Number(a.months), decider, outDir: out, resume: a.resume,
  policy: a.policy as 'events' | 'monthly', style: a.style as StateStyle, concurrency: Number(a.concurrency),
  onMonth: (world, r, ms) => {
    if (!a.quiet && (r.month % 12 === 0 || kev)) {
      const kevInfo = kev ? ` · kev p50 ${percentile(kev.stats.latencies, 50)}ms · cache hits ${kev.stats.cacheHits}` : '';
      console.log(`${monthLabel(r.month).padEnd(16)} pop ${String(world.sims.length).padStart(4)} · ${world.market.regime.padEnd(9)} · index ${Math.round(world.market.indexLevel).toString().padStart(6)} · rate ${(world.market.mortgageRate * 100).toFixed(1)}% · businesses ${String(world.economy.businessCount).padStart(3)} · empty rentals ${world.economy.vacantUnits}/${world.economy.rentalUnits} · decisions ${String(r.decisions.length).padStart(4)} · fallbacks ${r.fallbacks}${kevInfo} · ${ms}ms`);
    }
    if (r.month % Number(a['report-every']) === 0) console.log(`\n${monthLabel(r.month)} by archetype\n${archetypeTable(world)}\n`);
  },
});
if (res.resumedFrom !== null) console.log(`(resumed from month ${res.resumedFrom})`);
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${res.calls} decisions · ${res.fallbacks} fallbacks · ${res.world.hallOfFame.length} deaths`);
console.log(`\nFinal state by archetype\n${archetypeTable(res.world)}`);
console.log(`\nWhat each archetype chose (share of decisions)\n${decisionMix(res.world, res.decisions)}`);
console.log(`\nFiles written to ${out}/public and ${out}/log. Dashboard: npm run dashboard`);
