// "Why?" probe from the command line: load a world's latest snapshot, pick a sim, change one fact, compare the odds.
//   npm run probe -- --world world/seed-1-heuristic --sim s00042 [--change laid_off|all] [--decider model --decision-url ... --model d3]
import { parseArgs } from 'node:util';
import { heuristicDecider, probe, probeChangesFor, type Decider } from '@dls/sim-core';
import { DEFAULT_MODEL, decisionUrl, kevDecider } from './kev.ts';
import { WorldStore } from './store.ts';

const { values: a } = parseArgs({ options: {
  world: { type: 'string' }, sim: { type: 'string' }, change: { type: 'string', default: 'all' },
  decider: { type: 'string', default: 'heuristic' }, model: { type: 'string', default: DEFAULT_MODEL },
  'decision-url': { type: 'string' }, 'kev-url': { type: 'string' },
} });
if (!a.world) { console.error('usage: npm run probe -- --world <world-dir> [--sim <id>] [--change <id>|all] [--decider model ...]'); process.exit(1); }
const store = new WorldStore(a.world);
const snap = store.latestSnapshot();
if (snap === null) { console.error(`no snapshot in ${a.world}/snapshots`); process.exit(1); }
const world = store.resume(snap);
const sim = a.sim ? world.sims.find((s) => s.id === a.sim) : world.sims[0];
if (!sim) { console.error(`no sim ${a.sim} at month ${world.month}`); process.exit(1); }
const decider: Decider = a.decider === 'heuristic' ? heuristicDecider : kevDecider({ url: decisionUrl(a), model: a.model, apiKey: process.env.KEV_API_KEY, timeoutMs: 120_000 });
const changes = a.change === 'all' ? probeChangesFor(sim, world).map((c) => c.id) : [a.change!];
const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;
console.log(`${sim.name} (${sim.id}), month ${world.month}, decider ${decider.name}${a.decider === 'heuristic' ? '' : ` ${a.model}`}`);
for (const id of changes) {
  const r = await probe(world, sim.id, id, decider);
  const top = r.shift.filter((x) => Math.abs(x.delta) >= 0.01).slice(0, 4).map((x) => `${x.move} ${pct(x.delta)}`).join(', ') || 'no change';
  console.log(`  if they ${r.change.label}: ${top}${r.movesAdded.length ? ` · now allowed: ${r.movesAdded.join(', ')}` : ''}${r.movesRemoved.length ? ` · no longer allowed: ${r.movesRemoved.join(', ')}` : ''}`);
}
