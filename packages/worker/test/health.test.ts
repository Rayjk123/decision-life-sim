// The sim-health gate's own logic: inequality, bands, and the structural integrity scan (with planted faults).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, heuristicDecider, runMonth } from '@dls/sim-core';
import { gini, healthMetrics, integrityViolations, outOfBand } from '../../../scripts/health-lib.ts';

test('gini: 0 for equal wealth, near 1 when one holds everything, negatives clipped', () => {
  assert.equal(gini([5, 5, 5, 5]), 0);
  assert.ok(gini([0, 0, 0, 0, 0, 0, 0, 0, 0, 100]) > 0.85);
  assert.equal(gini([-10, 5, 5]), gini([0, 5, 5]));
});

test('bands: inside passes, outside and missing or NaN metrics fail', () => {
  assert.deepEqual(outOfBand({ a: 0.5 }, { a: [0, 1] }), []);
  assert.equal(outOfBand({ a: 2 }, { a: [0, 1] }).length, 1);
  assert.equal(outOfBand({ a: NaN }, { a: [0, 1] }).length, 1);
  assert.equal(outOfBand({}, { a: [0, 1] }).length, 1);
});

test('integrity scan is clean on a real world and catches planted NaN, fractional cents and negative debt', async () => {
  const w = createWorld(4, 40);
  for (let i = 0; i < 36; i++) await runMonth(w, heuristicDecider);
  assert.deepEqual(integrityViolations(w), []);
  const m = healthMetrics(w, [], 36 * 40);
  assert.ok(m.population > 0 && Number.isFinite(m.gini));
  const s = w.sims[0];
  s.cash = 100.5;
  s.index = NaN;
  s.loans.push({ ...(s.loans[0] ?? { kind: 'card', annualRate: 0.24, payment: 0 }), balance: -100 } as never);
  const v = integrityViolations(w).join('\n');
  assert.match(v, /is NaN/);
  assert.match(v, /not whole cents/);
  assert.match(v, /loan balance -100/);
});
