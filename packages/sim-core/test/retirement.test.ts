// Iteration 11: early retirement must cover a realistic retired budget, not just a working sim's spending money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAffordRetirement, createWorld, heuristicDecider, k, preMedicareHealth, runMonth, type Sim, type World } from '../src/index.ts';

async function midlifeSim(): Promise<{ w: World; s: Sim; m: number }> {
  const w = createWorld(3, 40);
  for (let i = 0; i < 60; i++) await runMonth(w, heuristicDecider);
  const s = w.sims[0];
  const m = w.month;
  s.birthMonth = m - 58 * 12;            // 58 years old
  s.retired = false; s.career = 'retail'; // no workplace pension
  s.assets = []; s.loans = []; s.rentsUnit = undefined; s.landlordId = undefined; s.unitRent = undefined;
  return { w, s, m };
}

test('a 58-year-old needs investments covering lifestyle, rent and health insurance, not just spending money', async () => {
  const { s, m } = await midlifeSim();
  s.index = k(300); s.stocks = 0;                 // $1,000/mo at 4%: enough for groceries, not for rent + insurance
  assert.equal(canAffordRetirement(s, m), false);
  s.index = k(3000);                              // $10,000/mo at 4%
  assert.equal(canAffordRetirement(s, m), true);
});

test('loan payments count against early retirement', async () => {
  const { s, m } = await midlifeSim();
  s.index = k(3000);
  assert.equal(canAffordRetirement(s, m), true);
  s.loans.push({ id: 'x', kind: 'business', balance: k(900), annualRate: 0.08, payment: k(11), assetId: undefined });
  assert.equal(canAffordRetirement(s, m), false);
});

test('health insurance applies before 65 only; 67+ can always retire', async () => {
  const { s, m } = await midlifeSim();
  assert.ok(preMedicareHealth(s, m) > 0);
  s.birthMonth = m - 66 * 12;
  assert.equal(preMedicareHealth(s, m), 0);
  s.birthMonth = m - 67 * 12; s.index = 0;
  assert.equal(canAffordRetirement(s, m), true);
});
