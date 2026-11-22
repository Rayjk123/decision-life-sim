// Iteration 10: businesses are valued from their own trailing profit and differ in how well they're run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessProfit, businessValue, createWorld, heuristicDecider, runMonth } from '../src/index.ts';

test('a business is worth 24 months of trailing profit, never less than zero', () => {
  assert.equal(businessValue(100_000), 2_400_000);
  assert.equal(businessValue(-50_000), 0);
});

test('better-run businesses earn more in the same town, capped at the top of the type range', () => {
  const w = createWorld(1, 10);
  const at = (q: number) => businessProfit(w, 1, -100_000, 500_000, 1, q);
  assert.ok(at(0.4) < at(1) && at(1) <= at(2.2));
  assert.ok(at(100) <= 500_000);
});

test('in a grown world every business has a quality, and values differ within a type', async () => {
  const w = createWorld(1, 200);
  while (w.month < 360) await runMonth(w, heuristicDecider);
  const biz = w.sims.flatMap((s) => s.assets.filter((a) => a.kind === 'business'));
  assert.ok(biz.length >= 10);
  assert.ok(biz.every((b) => b.quality !== undefined && b.quality >= 0.4 && b.quality <= 2.2));
  const byType = new Map<string, Set<number>>();
  for (const b of biz) byType.set(b.businessType!, (byType.get(b.businessType!) ?? new Set()).add(b.value));
  const multi = [...byType.values()].filter((vs) => vs.size > 1);
  assert.ok(multi.length > 0, 'businesses of the same type should no longer share one value');
});
