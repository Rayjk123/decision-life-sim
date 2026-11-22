// Iteration 14: saving habits vary within an archetype; about a third of people barely save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPE, consumptionShare, createWorld, effectiveAutoInvest, saveHabitFor, spawnSim, type Sim } from '../src/index.ts';

test('habits are deterministic, bounded, and about a third barely save', () => {
  const hs = Array.from({ length: 2000 }, (_, i) => saveHabitFor(42, i));
  assert.deepEqual(hs.slice(0, 50), Array.from({ length: 50 }, (_, i) => saveHabitFor(42, i)));
  assert.ok(hs.every((h) => h >= 0.1 && h <= 1.5));
  const low = hs.filter((h) => h < 0.5).length / hs.length;
  assert.ok(low > 0.3 && low < 0.4, `share of low savers ${low}`);
});

test('a typical habit keeps the archetype share; a low habit spends more; shares stay in 0.3-0.99', () => {
  const s = { archetype: 'balanced', autoInvestPct: 0.1 } as Sim;
  assert.equal(consumptionShare(s), ARCHETYPE.balanced.consumption);
  s.saveHabit = 0.2;
  assert.ok(consumptionShare(s) > ARCHETYPE.balanced.consumption);
  assert.equal(effectiveAutoInvest(s), 0, 'low savers keep no standing order');
  s.saveHabit = 1.5; s.archetype = 'fire';
  assert.ok(consumptionShare(s) >= 0.3 && consumptionShare(s) < ARCHETYPE.fire.consumption);
  assert.equal(effectiveAutoInvest(s), 0.1);
});

test('every new sim gets a habit', () => {
  const w = createWorld(9, 10);
  const sims = Array.from({ length: 30 }, () => spawnSim(w, 0));
  assert.ok(sims.every((x) => typeof x.saveHabit === 'number'));
  assert.ok(new Set(sims.map((x) => x.saveHabit)).size > 10);
});
