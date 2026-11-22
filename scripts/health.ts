// G7 sim health + G8 performance: grow heuristic worlds and check they stay structurally sound, inside
// realism bands, and inside a time budget. No model needed.
//   npm run health                 seeds 1-3, 50 years, 200 sims (bands from scripts/health.baseline.json)
//   npm run health -- --record     print the measured metrics as JSON (to set or review bands)
// Bands are deliberately wide: they catch a broken economy, not normal tuning. Tighten them as realism work lands.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorld, heuristicDecider, runMonth, type SimEvent } from '@dls/sim-core';
import { healthMetrics, integrityViolations, outOfBand, type Band, type HealthMetrics } from './health-lib.ts';

const cfg = JSON.parse(readFileSync(join(import.meta.dirname, 'health.baseline.json'), 'utf8')) as {
  seeds: number[]; months: number; pop: number; secondsPerRunBudget: number; bands: Record<string, Band>;
};
const record = process.argv.includes('--record');

let failures = 0;
const rows: Array<HealthMetrics & { seed: number; seconds: number }> = [];
for (const seed of cfg.seeds) {
  const t0 = Date.now();
  const world = createWorld(seed, cfg.pop);
  const events: SimEvent[] = [];
  let simMonths = 0;
  while (world.month < cfg.months) {
    const r = await runMonth(world, heuristicDecider);
    events.push(...r.events);
    simMonths += world.sims.length;
  }
  const seconds = (Date.now() - t0) / 1000;
  const m = healthMetrics(world, events, simMonths);
  rows.push({ seed, seconds, ...m });
  const problems = [
    ...integrityViolations(world).map((v) => `integrity: ${v}`),
    ...outOfBand(m as unknown as Record<string, number>, cfg.bands),
    ...(seconds > cfg.secondsPerRunBudget ? [`time ${seconds.toFixed(1)}s over budget ${cfg.secondsPerRunBudget}s`] : []),
  ];
  const fmt = (k: keyof HealthMetrics) => { const v = m[k]; return Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(3); };
  console.log(`${problems.length && !record ? '❌' : '✅'} seed ${seed}: ${seconds.toFixed(1)}s · ` +
    (Object.keys(m) as Array<keyof HealthMetrics>).map((k) => `${k} ${fmt(k)}`).join(' · '));
  if (!record) for (const p of problems) { console.log(`     ${p}`); failures++; }
}
if (record) console.log(JSON.stringify(rows, null, 1));
console.log(failures ? `\nhealth FAILED: ${failures} problem(s)` : `\nhealth passed (${cfg.seeds.length} seeds × ${cfg.months / 12} years × ${cfg.pop} sims)`);
process.exit(failures && !record ? 1 : 0);
