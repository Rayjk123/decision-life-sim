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
  const ledger = new Map(saved!.world.sims.map(sim => [sim.id, sim.flows]));
  assert.equal(await town(now + 1000).then(x => x.month), 121);
  assert.equal(saved!.pending?.month, 122);
  const firstMix = await town.decisionMix(122);
  assert.deepEqual(firstMix.months.map(row => row.month), [121]);
  assert.equal(firstMix.decisions, first.sims.filter(sim => sim.move).length);
  assert.equal(firstMix.missingArchetype, 0);
  assert.ok(firstMix.groups.every(group => group.provider === 'heuristic' && group.knownOffers === group.decisions));
  assert.ok(firstMix.groups.every(group => group.moves.every(move => move.offered <= group.knownOffers && move.pickedWhenOffered <= move.offered)));
  const original = first.sims.find(sim => sim.hasProbe && sim.decision?.sampling && saved!.pending!.sims.some(next => next.id === sim.id))!;
  const id = original.id;
  const source = saved!.current.sims.find(sim => sim.id === id)!;
  const recorded = source.decision;
  assert.ok(source.probe);
  assert.equal(source.probe.afterCoin, source.probe.beforeCoin * 2);
  assert.equal(source.probe.modelRequest, undefined);
  assert.deepEqual(Object.keys(source.probe.heuristicOdds), source.probe.offered);
  assert.ok(!Object.hasOwn(original, 'probe'));
  assert.ok(!Object.hasOwn(original, 'cashFlow'));
  assert.ok(!Object.hasOwn(original, 'events'));
  const flows = ledger.get(id)!;
  const { salary = 0, benefits = 0, pension = 0, part_time = 0, rent_received = 0, tax = 0, business_profit = 0 } = flows;
  assert.equal(source.cashFlow.income, salary + benefits + pension + part_time + rent_received + tax + Math.max(0, business_profit));
  assert.equal(source.cashFlow.discretionary, -(flows.discretionary ?? 0));
  assert.deepEqual((await town.residentHistory(id))[0].cashFlow, source.cashFlow);
  assert.deepEqual((await town.residentHistory(id)).map(row => row.month), [121]);
  assert.equal((await store.load())!.value.history, undefined);
  const restarted = sharedWorld(store, { pop: 12 });
  assert.equal(await restarted(now + DAY).then(x => x.month), 122);
  const history = await restarted.residentHistory(id);
  assert.deepEqual(history.map(row => row.month), [121, 122]);
  const recordedLife = await restarted.residentLifetime(id, 121);
  assert(recordedLife && !recordedLife.partial);
  assert(recordedLife.events.some(event => event.month < 121 && event.text.includes('moved to town')));
  assert.equal(recordedLife.wealth.at(-1)?.nw, original.nw);
  assert(recordedLife.wealth.every(point => point.month <= 121));
  assert.equal(history[0].nw, original.nw);
  assert.ok(recorded?.reason);
  assert.ok(recorded?.offered.includes(original.move!));
  assert.equal(typeof recorded?.context?.money, 'string');
  assert.deepEqual(history[0].decision, recorded);
  assert.deepEqual(history[0].probabilities, original.probabilities);
  assert.equal(history[0].draw, original.draw);
  assert.equal(history[0].arch, original.arch);
  assert.deepEqual(history[0].cashFlow, source.cashFlow);
  assert.deepEqual(history[0].events, source.events);
  assert.equal(history[0].hasProbe, true);
  assert.ok(!Object.hasOwn(history[0], 'probe'));
  assert.deepEqual(saved!.history?.[0].residents[id].probe, source.probe);
  const beforeProbe = await store.load();
  const comparison = await restarted.counterfactual(id, 121);
  assert.equal(comparison.status, 'ready');
  assert.deepEqual(comparison.base, original.probabilities);
  assert.deepEqual(comparison.variant, source.probe.heuristicOdds);
  assert.equal(comparison.afterCoin, comparison.beforeCoin * 2);
  assert.deepEqual(await store.load(), beforeProbe);
  assert.deepEqual(await restarted.counterfactual(id, 123), { status: 'unavailable' });
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
  assert.deepEqual(await restarted.residentLifetime(id, 121), {
    ...recordedLife, wealth: recordedLife.wealth.filter(point => point.month < 121),
  });
  const months = saved!.history?.map(row => row.month);
  assert.deepEqual(months, Array.from({ length: 11 }, (_, i) => 124 + i));
});

test('lifetime records expose published deaths and recover older checkpoints without inventing history', async () => {
  let saved: Checkpoint | undefined;
  const storage: Storage = {
    async load() { return saved ? { value: structuredClone(saved), version: 'test' } : null; },
    async save(value) { saved = structuredClone(value); return true; },
  };
  const town = sharedWorld(storage, { pop: 12 });
  const first = await town(0);
  const resident = saved!.world.sims.find(sim => sim.arrivedMonth < first.month)!;
  const id = resident.id;
  resident.deathMonth = first.month + 1;
  delete saved!.lifetimes;
  const legacy = await town.residentLifetime(id, first.month);
  assert(legacy?.partial);
  assert.deepEqual(legacy.wealth.map(point => point.month), [first.month]);
  assert.equal(saved!.lifetimes, undefined, 'reading should leave storage unchanged');
  await town(1000);
  const pending = saved!.world.hallOfFame.find(death => death.simId === id)!;
  assert(pending);
  assert(!(await town.pastResidents(first.month + 1)).some(resident => resident.id === id));
  assert(!(await town.residentLifetime(id, first.month + 1))!.events.some(event => event.text.includes(' died ')));
  await town(DAY);
  const restarted = sharedWorld(storage, { pop: 12 });
  assert.equal((await restarted.pastResidents(first.month + 1))[0].id, id);
  const memorial = await restarted.residentLifetime(id, first.month + 1);
  assert.equal(memorial?.wealth.at(-1)?.nw, pending.finalNetWorth);
  assert(memorial?.events.some(event => event.month === pending.diedMonth && event.text.includes(' died ')));
  assert.equal(await restarted.residentLifetime('constructor', first.month + 1), null);
});
