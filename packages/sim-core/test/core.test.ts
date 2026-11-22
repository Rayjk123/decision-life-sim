import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amortizedPayment, balanceSheet, createWorld, dollars, heuristicDecider, k, legalMoves, liquidAbove, quoteRental,
  rngFor, runMonth, spawnSim,
} from '../src/index.ts';

test('rng is deterministic per key and independent across keys', () => {
  const a = rngFor(1, 'x', 5).next();
  assert.equal(a, rngFor(1, 'x', 5).next());
  assert.notEqual(a, rngFor(1, 'x', 6).next());
});

test('amortized payment matches the textbook formula', () => {
  // $128k at 6.1% for 30 years is about $776/month
  const p = amortizedPayment(k(128), 0.061, 360);
  assert.ok(Math.abs(p - dollars(775.66)) < dollars(1), `got ${p}`);
});

test('a rental is never offered without enough liquid money for down payment and closing', () => {
  const world = createWorld(3, 10);
  world.month = 400;
  const sim = spawnSim(world, 400 - 12 * 16); // a 34-year-old
  sim.career = 'nurse'; sim.employed = true; sim.salary = k(78); sim.loans = [];
  const q = quoteRental(sim, world);
  sim.cash = q.down + q.closing - dollars(1000); // just short, and nothing invested
  assert.ok(!legalMoves(sim, world).some((m) => m.kind === 'buy_rental'), 'rental offered without the money');
  sim.cash = q.down + q.closing + k(60);
  assert.ok(liquidAbove(sim, world.month) >= q.down + q.closing);
  assert.ok(legalMoves(sim, world).some((m) => m.kind === 'buy_rental'), 'rental not offered with plenty of money');
});

test('the same seed replays to an identical world', async () => {
  const run = async () => {
    const w = createWorld(42, 60);
    for (let i = 0; i < 72; i++) await runMonth(w, heuristicDecider);
    return JSON.stringify(w);
  };
  assert.equal(await run(), await run());
});

test('a 30-year heuristic run stays sane', async () => {
  const w = createWorld(9, 150);
  let bankruptcies = 0;
  for (let i = 0; i < 360; i++) {
    const r = await runMonth(w, heuristicDecider);
    bankruptcies += r.events.filter((e) => e.type === 'bankrupt').length;
  }
  assert.equal(w.sims.length, 150);
  for (const s of w.sims) {
    const bs = balanceSheet(s);
    for (const [key, v] of Object.entries(bs)) assert.ok(Number.isFinite(v), `${s.id} ${key} is ${v}`);
    assert.ok(s.cash >= 0, `${s.id} has negative cash`);
  }
  const simYears = 150 * 30;
  assert.ok(bankruptcies / simYears < 0.01, `bankruptcy rate too high: ${bankruptcies} in ${simYears} sim-years`);
});

test('savers end with more cash than spenders on the same seed', async () => {
  const w = createWorld(5, 300);
  for (let i = 0; i < 300; i++) await runMonth(w, heuristicDecider);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const by = (key: string) => median(w.sims.filter((s) => s.archetype === key && s.employed).map((s) => s.cash + s.index));
  assert.ok(by('saver') > by('spender'), `saver ${by('saver')} vs spender ${by('spender')}`);
});
