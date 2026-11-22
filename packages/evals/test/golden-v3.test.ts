// Golden-change run (iteration 20): scenarios show their own archetype's standing order, and essentials scale
// with income between a floor and a cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_INVEST, k, livingCost } from '@dls/sim-core';
import { buildScenario } from '../src/build.ts';
import { loadGolden } from '../src/suite.ts';

test("every golden scenario's sim auto-invests at its own archetype's rate", () => {
  for (const sc of loadGolden().scenarios) {
    const { sim } = buildScenario(sc);
    assert.equal(sim.autoInvestPct, AUTO_INVEST[sc.sim.archetype], sc.id);
  }
  const fire = buildScenario(loadGolden().scenarios.find((s) => s.id === 'A-fire')!).sim;
  assert.equal(fire.autoInvestPct, 0.5, 'the early retiree used to show 10%');
});

test('essentials scale with income: at least $1,100 for low earners, at least $1,800 for high earners, at least $800 out of work', () => {
  const sc = loadGolden().scenarios.find((s) => s.id === 'A-balanced')!;
  const { sim, world } = buildScenario(sc);
  const m = world.month;
  sim.loans = []; sim.assets = [];
  sim.employed = true; sim.salary = k(18);
  assert.ok(livingCost(sim, m) >= k(1.1), `low earner ${livingCost(sim, m)}`);
  sim.salary = k(300);
  assert.ok(livingCost(sim, m) >= k(1.8), 'high earners spend at least the cap on essentials');
  sim.employed = false; sim.salary = 0;
  assert.ok(livingCost(sim, m) >= k(0.8), 'out of work: the bare-bones floor (spending above it comes from benefits)');
});
