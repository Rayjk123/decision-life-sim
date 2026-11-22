// SPEC decision 17: a crude progressive marginal tax.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualTax, k, taxRate } from '../src/index.ts';

test('effective rates match the spec table (about 11% at $30k, 16% at $60k, 21% at $100k, 29% at $250k)', () => {
  const eff = (thousands: number) => taxRate(k(thousands));
  assert.ok(Math.abs(eff(30) - 0.108) < 0.005, `30k ${eff(30)}`);
  assert.ok(Math.abs(eff(60) - 0.161) < 0.005, `60k ${eff(60)}`);
  assert.ok(Math.abs(eff(100) - 0.208) < 0.005, `100k ${eff(100)}`);
  assert.ok(Math.abs(eff(250) - 0.289) < 0.005, `250k ${eff(250)}`);
  assert.equal(annualTax(k(12)), 0);
  assert.equal(taxRate(0), 0);
});

test('progressive and marginal: a raise never lowers take-home, and the rate never falls as income rises', () => {
  let prevTakeHome = -1;
  let prevRate = -1;
  for (let d = 0; d <= 400_000; d += 500) {
    const gross = d * 100;
    const takeHome = gross - annualTax(gross);
    const rate = taxRate(gross);
    assert.ok(takeHome >= prevTakeHome, `take-home fell at ${d} dollars`);
    assert.ok(rate >= prevRate - 1e-12, `rate fell at ${d} dollars`);
    prevTakeHome = takeHome;
    prevRate = rate;
  }
  // the old whole-income cliff: 49k -> 51k used to cut take-home pay
  assert.ok(k(51) - annualTax(k(51)) > k(49) - annualTax(k(49)));
});
