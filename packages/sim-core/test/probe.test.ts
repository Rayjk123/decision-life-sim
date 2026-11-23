// "Why?" probes: one fact changed, the decider re-asked, the world untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, growHistory, heuristicDecider, probe, probeChangesFor, PROBE_CHANGES } from '@dls/sim-core';

test('a probe re-asks with one fact changed, never touches the real world, and is deterministic', async () => {
  const w = await growHistory(createWorld(2, 80), 30);
  const sim = w.sims.find((s) => s.employed && s.cash > 0)!;
  const before = JSON.stringify(w);
  const a = await probe(w, sim.id, 'laid_off', heuristicDecider);
  const b = await probe(w, sim.id, 'laid_off', heuristicDecider);
  assert.equal(JSON.stringify(w), before, 'the world is unchanged');
  assert.deepEqual(a, b, 'same inputs, same answer');
  assert.equal(a.change.id, 'laid_off');
  const sum = (p: Record<string, number>) => Object.values(p).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum(a.base) - 1) < 1e-6 && Math.abs(sum(a.variant) - 1) < 1e-6);
  assert.ok(a.shift.some((x) => Math.abs(x.delta) > 0.01) || a.movesRemoved.length > 0, 'losing the job changes the odds or the legal moves');
});

test('only changes that apply are offered (no "wages back" for someone employed)', async () => {
  const w = await growHistory(createWorld(5, 60), 20);
  const employed = w.sims.find((s) => s.employed)!;
  const ids = probeChangesFor(employed, w).map((c) => c.id);
  assert.ok(!ids.includes('paycheck') && ids.includes('laid_off') && ids.includes('crash'));
  assert.ok(PROBE_CHANGES.every((c) => c.label.length > 5));
  await assert.rejects(probe(w, employed.id, 'nope', heuristicDecider), /unknown probe change/);
});
