// SPEC decision 18: spend levels 1-10 (ongoing lifestyle share + one-off purchases at 6-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySpendLevel, baselineSpendLevel, createWorld, flowTotal, heuristicDecider, heuristicSpendLevel, k, runMonth,
  sampleSpendLevel, SPEND_LEVELS, spawnSim, type Sim, type World,
} from '../src/index.ts';

async function grownWorld(): Promise<World> {
  const w = createWorld(4, 30);
  for (let i = 0; i < 120; i++) await runMonth(w, heuristicDecider);
  return w;
}
function adult(w: World, archetype: Sim['archetype']): Sim {
  const s = spawnSim(w, w.month - 20 * 12);
  Object.assign(s, { archetype, saveHabit: undefined, employed: true, salary: k(70), cash: k(20), savings: 0, loans: [], memory: [], missedPayments: 0 });
  return s;
}

test('the table: ten levels, lifestyle share never falls, one-offs only at 6-10 and growing', () => {
  assert.deepEqual(SPEND_LEVELS.map((l) => l.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (let i = 1; i < 10; i++) assert.ok(SPEND_LEVELS[i].share >= SPEND_LEVELS[i - 1].share);
  assert.ok(SPEND_LEVELS.slice(0, 5).every((l) => !l.oneOff));
  const lows = SPEND_LEVELS.slice(5).map((l) => l.oneOff![0]);
  assert.deepEqual([...lows].sort((a, b) => a - b), lows);
});

test('personality sets the baseline: spender > balanced > saver > early retiree', async () => {
  const w = await grownWorld();
  const lv = (a: Sim['archetype']) => baselineSpendLevel(adult(w, a));
  assert.ok(lv('spender') > lv('balanced') && lv('balanced') > lv('saver') && lv('saver') > lv('fire'), `${lv('spender')} ${lv('balanced')} ${lv('saver')} ${lv('fire')}`);
});

test('the heuristic level falls in a crash and when unemployed, and rises after a raise', async () => {
  const w = await grownWorld();
  const s = adult(w, 'spender');
  w.market.regime = 'expansion'; w.market.lastIndexReturn = 0.01; w.market.jobsSignal = 'steady';
  const calm = heuristicSpendLevel(s, w);
  w.market.regime = 'crash'; w.market.lastIndexReturn = -0.14; w.market.jobsSignal = 'weak';
  assert.ok(heuristicSpendLevel(s, w) < calm);
  w.market.regime = 'expansion'; w.market.lastIndexReturn = 0.01; w.market.jobsSignal = 'steady';
  s.memory = ['Got a raise to $80k'];
  assert.ok(heuristicSpendLevel(s, w) >= calm);
  s.memory = []; s.employed = false; s.salary = 0;
  assert.ok(heuristicSpendLevel(s, w) <= 2);
});

test('a one-off purchase is drawn in range, paid through the ledger, and capped by what is reachable', async () => {
  const w = await grownWorld();
  const s = adult(w, 'spender');
  s.flows = {};
  const before = s.cash;
  const evs = applySpendLevel(w, s, 7);
  assert.equal(s.spendLevel, 7);
  assert.equal(evs.length, 1);
  const spent = -(s.flows.discretionary ?? 0);
  assert.ok(spent >= k(0.4) && spent <= k(2), `spent ${spent}`);
  assert.equal(s.cash - before, flowTotal(s));
  const broke = adult(w, 'spender');
  Object.assign(broke, { cash: 0, savings: 0, salary: k(10), flows: {} });
  broke.loans = [{ id: 'c', kind: 'card', balance: k(100), annualRate: 0.24, payment: 0 }];
  assert.deepEqual(applySpendLevel(w, broke, 10), [], 'no money and a maxed card: no blowout');
  // iteration 22 review: a sim barred from borrowing can't splurge on the card, even with room on it
  const barred = adult(w, 'spender');
  Object.assign(barred, { cash: 0, savings: 0, flows: {}, bankruptUntil: w.month + 60 });
  barred.loans = [];
  assert.deepEqual(applySpendLevel(w, barred, 7), [], 'bankrupt: no splurge on credit');
  assert.equal(barred.flows.card_draw ?? 0, 0);
  assert.ok(broke.cash >= 0);
});

test('sampling follows the decider probabilities', () => {
  const probs = { '3': 0.5, '7': 0.5 };
  assert.equal(sampleSpendLevel(probs, 0.1), 3);
  assert.equal(sampleSpendLevel(probs, 0.9), 7);
  assert.equal(sampleSpendLevel({}, 0.5), 5);
});
