// A town with a past (growHistory) and movers of every age (arrivalAgeFor): the town starts with every age group
// instead of one cohort of 18-year-olds, deterministically, with the clock re-based to month 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageInt, arrivalAgeFor, balanceSheet, createWorld, growHistory, heuristicDecider, historySeed, runMonth } from '@dls/sim-core';

const decades = (w: Awaited<ReturnType<typeof growHistory>>) => {
  const b: Record<string, number> = {};
  for (const s of w.sims) { const a = ageInt(s, w.month); const k = a < 30 ? '18-29' : a < 70 ? `${Math.floor(a / 10)}0s` : '70+'; b[k] = (b[k] ?? 0) + 1; }
  return b;
};

test('a town with history starts at month 0 with every age group, not one cohort', async () => {
  const w = await growHistory(createWorld(3, 200));
  assert.equal(w.month, 0);
  assert.ok(w.sims.length >= 195 && w.sims.length <= 200, `${w.sims.length} sims (deaths are replaced at the next tick)`);
  assert.equal(w.hallOfFame.length, 0, 'history deaths are not in the visible Hall of Fame');
  const b = decades(w);
  for (const k of ['18-29', '30s', '40s', '50s', '60s', '70+']) assert.ok((b[k] ?? 0) >= 8, `${k}: ${b[k] ?? 0} sims (${JSON.stringify(b)})`);
  assert.ok(Math.max(...Object.values(b)) / 200 < 0.35, `no age group dominates: ${JSON.stringify(b)}`);
  assert.ok(w.sims.some((s) => s.assets.some((a) => a.kind === 'home')), 'some sims already own homes');
});

test('history is deterministic and runs under its own seed', async () => {
  const a = await growHistory(createWorld(11, 60), 30);
  const b = await growHistory(createWorld(11, 60), 30);
  assert.deepEqual(a, b);
  assert.equal(a.seed, 11, 'the visible era runs under the town seed');
  assert.notEqual(historySeed(11), 11);
});

test('the re-based clock stays consistent: ages, birthdays ahead of death, unique asset ids, sane books', async () => {
  const w = await growHistory(createWorld(4, 120), 60);
  for (const s of w.sims) {
    assert.ok(s.birthMonth < 0 && s.arrivedMonth <= 0, `${s.id} was born and arrived before month 0`);
    assert.ok(s.deathMonth > 0, `${s.id} is alive at month 0`);
    for (const a of s.assets) assert.ok(a.boughtMonth <= 0 && a.id.endsWith('-h'), `${a.id} bought during the history`);
  }
  for (let i = 0; i < 120; i++) await runMonth(w, heuristicDecider);
  const ids = w.sims.flatMap((s) => s.assets.map((a) => a.id));
  assert.equal(new Set(ids).size, ids.length, 'no asset id reused after the clock restarts');
  for (const s of w.sims) {
    for (const l of s.loans) if (l.assetId) assert.ok(s.assets.some((a) => a.id === l.assetId) || l.kind === 'business', `${l.id} points at an owned asset`);
    for (const v of Object.values(balanceSheet(s))) assert.ok(Number.isFinite(v));
    assert.ok(s.cash >= 0, `${s.id} has negative cash`);
  }
});

test('movers arrive at every adult age; about half at 18', () => {
  const ages = Array.from({ length: 2000 }, (_, i) => arrivalAgeFor(1, i + 1));
  const at18 = ages.filter((a) => a === 18).length / ages.length;
  assert.ok(at18 > 0.45 && at18 < 0.55, `share at 18: ${at18}`);
  assert.ok(Math.min(...ages) >= 18 && Math.max(...ages) <= 55);
  assert.ok(ages.filter((a) => a >= 40).length > 100, 'some movers are 40+');
});
