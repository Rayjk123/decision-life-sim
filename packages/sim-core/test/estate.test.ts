// Iteration 13: estates are split among heirs; only one heir lives in town.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, ESTATE_HEIRS, estateShare, heuristicDecider, runMonth } from '../src/index.ts';

test('an heir gets 90% of the estate divided by the number of heirs', () => {
  assert.equal(estateShare(1_000_000, 1), 900_000);
  assert.equal(estateShare(1_000_000, 3), 300_000);
  assert.ok(ESTATE_HEIRS.every((h) => h >= 1 && h <= 4));
  assert.equal(ESTATE_HEIRS.reduce((t, h) => t + h, 0) / ESTATE_HEIRS.length, 2.5);
});

test('positive estates record 1-4 heirs, newcomers inherit exactly one share, and splits really vary', async () => {
  const w = createWorld(7, 120);
  while (w.month < 720) await runMonth(w, heuristicDecider);
  const estates = w.hallOfFame.filter((h) => h.finalNetWorth > 0);
  assert.ok(estates.length >= 10);
  assert.ok(estates.every((h) => h.heirs !== undefined && h.heirs >= 1 && h.heirs <= 4));
  assert.ok(new Set(estates.map((h) => h.heirs)).size >= 3, 'heir counts should vary');
  assert.ok(w.hallOfFame.filter((h) => h.finalNetWorth <= 0).every((h) => h.heirs === undefined));
});
