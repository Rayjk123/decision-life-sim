import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAY, sharedWorld, type Checkpoint, type Storage } from '../src/world.ts';

test('viewers share one paced world, and a restart preserves its month', async () => {
  let saved: Checkpoint | undefined;
  let revision = 0;
  const store: Storage = {
    async load() { return saved ? { value: structuredClone(saved), version: String(revision) } : null; },
    async save(value, version) {
      if (version !== (saved ? String(revision) : undefined)) return false;
      saved = structuredClone(value);
      revision++;
      return true;
    },
  };
  const town = sharedWorld(store, { pop: 12 });
  const now = 1_000_000;
  const [first, second] = await Promise.all([town(now), town(now)]);
  assert.deepEqual(first, second);
  assert.equal(first.month, 121);
  assert.ok(first.sims.length > 0);
  assert.equal(await town(now + 1000).then(x => x.month), 121);
  assert.equal(saved!.pending?.month, 122);
  const firstMix = await town.decisionMix(122);
  assert.deepEqual(firstMix.months.map(row => row.month), [121]);
  assert.equal(firstMix.decisions, first.sims.filter(sim => sim.move).length);
  assert.equal(firstMix.missingArchetype, 0);
  assert.ok(firstMix.groups.every(group => group.provider === 'heuristic' && group.knownOffers === group.decisions));
  assert.ok(firstMix.groups.every(group => group.moves.every(move => move.offered <= group.knownOffers && move.pickedWhenOffered <= move.offered)));
  const original = first.sims.find(sim => sim.decision?.sampling && saved!.pending!.sims.some(next => next.id === sim.id))!;
  const id = original.id;
  const recorded = saved!.current.sims.find(sim => sim.id === id)!.decision;
  assert.deepEqual((await town.residentHistory(id)).map(row => row.month), [121]);
  assert.equal((await store.load())!.value.history, undefined);
  const restarted = sharedWorld(store, { pop: 12 });
  assert.equal(await restarted(now + DAY).then(x => x.month), 122);
  const history = await restarted.residentHistory(id);
  assert.deepEqual(history.map(row => row.month), [121, 122]);
  assert.equal(history[0].nw, original.nw);
  assert.ok(recorded?.reason);
  assert.ok(recorded?.offered.includes(original.move!));
  assert.equal(typeof recorded?.context?.money, 'string');
  assert.deepEqual(history[0].decision, recorded);
  assert.deepEqual(history[0].probabilities, original.probabilities);
  assert.equal(history[0].draw, original.draw);
  assert.equal(history[0].arch, original.arch);
  assert.deepEqual(await restarted.decisionMix(121), firstMix);
  assert.deepEqual(await restarted.residentHistory('toString'), []);
  const wake = await restarted(now + DAY + 16 * 60_000);
  assert.equal(wake.month, 122);
  assert.equal(wake.startedAt, wake.serverTime);
  for (let i = 1; i <= 13; i++) {
    const from = wake.serverTime + (i - 1) * DAY;
    await restarted(from + 1000);
    await restarted(from + DAY);
  }
  assert.equal(saved!.history?.length, 11);
  const months = saved!.history?.map(row => row.month);
  assert.deepEqual(months, Array.from({ length: 11 }, (_, i) => 124 + i));
});
