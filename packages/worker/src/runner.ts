// Runs a world for N months with a decider, writing everything through WorldStore. Shared by the CLI,
// the experiment and the integration tests.
import { join } from 'node:path';
import { createWorld, runMonth, type DecisionRecord, type Decider, type MonthResult, type StateStyle, type World } from '@dls/sim-core';
import { WorldStore } from './store.ts';

export interface RunOptions {
  seed: number;
  pop: number;
  months: number;
  decider: Decider;
  outDir: string;                 // the world folder (e.g. world/seed-1-heuristic)
  policy?: 'events' | 'monthly';
  style?: StateStyle;
  concurrency?: number;
  resume?: boolean;
  onMonth?: (world: World, r: MonthResult, ms: number) => void;
}

export async function runWorld(o: RunOptions): Promise<{ world: World; decisions: DecisionRecord[]; calls: number; fallbacks: number; resumedFrom: number | null }> {
  const store = new WorldStore(o.outDir);
  let world: World;
  let resumedFrom: number | null = null;
  if (o.resume && (resumedFrom = store.latestSnapshot()) !== null) world = store.resume(resumedFrom);
  else world = createWorld(o.seed, o.pop);
  const decisions: DecisionRecord[] = [];
  let calls = 0, fallbacks = 0;
  while (world.month < o.months) {
    const t = Date.now();
    const r = await runMonth(world, o.decider, { policy: o.policy, style: o.style, concurrency: o.concurrency });
    store.write(world, r);
    decisions.push(...r.decisions);
    calls += r.calls; fallbacks += r.fallbacks;
    o.onMonth?.(world, r, Date.now() - t);
  }
  return { world, decisions, calls, fallbacks, resumedFrom };
}

export const worldDir = (out: string, seed: number, decider: string) => join(out, `seed-${seed}-${decider}`);
