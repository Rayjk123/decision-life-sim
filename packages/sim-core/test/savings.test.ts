// Iteration 15: a savings account (safe asset), risk-based saving, the cushion in savings, savings drawn first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceSheet, cashCushion, createWorld, emergencyFloor, heuristicDecider, k, raiseCash, riskyShare, runMonth, spawnSim, type Sim } from '../src/index.ts';

const withTraits = (archetype: string, risk: number, lossAversion: number) =>
  ({ archetype, traits: { risk, debt: 0.5, status: 0.5, patience: 0.5, discipline: 0.5, herding: 0.5, lossAversion } } as unknown as Sim);

test('risky share: cautious types keep savings, natural investors invest, and it moves with risk and loss aversion', () => {
  assert.equal(riskyShare(withTraits('saver', 0.2, 0.85)), 0);
  assert.equal(riskyShare(withTraits('index', 0.2, 0.9)), 0.9);
  assert.ok(riskyShare(withTraits('balanced', 0.7, 0.5)) > riskyShare(withTraits('balanced', 0.4, 0.5)));
  assert.ok(riskyShare(withTraits('balanced', 0.5, 0.3)) > riskyShare(withTraits('balanced', 0.5, 0.7)));
  for (const r of [0, 0.5, 1]) for (const la of [0, 0.5, 1]) { const x = riskyShare(withTraits('status', r, la)); assert.ok(x >= 0 && x <= 1); }
});

test('savings count toward the cushion, are drawn before investments, and are in net worth', async () => {
  const w = createWorld(2, 20);
  for (let i = 0; i < 80; i++) await runMonth(w, heuristicDecider);
  const s = spawnSim(w, w.month - 30 * 12);
  s.savings = 0;
  const floor = emergencyFloor(s, w.month);
  assert.equal(cashCushion(s, w.month), floor);
  s.savings = floor;
  assert.equal(cashCushion(s, w.month), 0);
  s.cash = 0; s.savings = k(5); s.index = k(50);
  raiseCash(s, k(3));
  assert.equal(s.cash, k(3)); assert.equal(s.savings, k(2)); assert.equal(s.index, k(50));
  assert.equal(balanceSheet(s).savings, k(2));
  assert.equal(balanceSheet(s).netWorth, k(3) + k(2) + k(50) + balanceSheet(s).property + balanceSheet(s).other - balanceSheet(s).debt);
});

test('in a grown world cautious sims hold savings, savings stay non-negative whole cents, and both kinds of saver exist', async () => {
  const w = createWorld(1, 150);
  while (w.month < 360) await runMonth(w, heuristicDecider);
  const adults = w.sims.filter((s) => s.cash !== undefined);
  assert.ok(adults.every((s) => (s.savings ?? 0) >= 0 && Number.isInteger(s.savings ?? 0)));
  const savers = adults.filter((s) => s.archetype === 'saver' && (s.saveHabit ?? 1) >= 0.5);
  assert.ok(savers.length > 0 && savers.some((s) => (s.savings ?? 0) > 0), 'cautious habitual savers should hold savings');
  assert.ok(adults.some((s) => (s.savings ?? 0) === 0), 'low savers keep money in checking');
});
