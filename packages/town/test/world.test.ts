import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawFor, heuristicAnswers, pick, type Decider } from '../../sim-core/src/index.ts';
import { DAY, sharedWorld, type Checkpoint, type Storage } from '../src/world.ts';

test('model replay uses the original legal moves and draw and survives archival', async () => {
  let saved: Checkpoint | undefined;
  const storage: Storage = {
    async load() { return saved ? { value: structuredClone(saved), version: 'test' } : null; },
    async save(value) { saved = structuredClone(value); return true; },
  };
  const expected = new Map<string, { odds: Record<string, number>; move: string; draw: number }>();
  const failed = new Set<string>();
  const decider: Decider = {
    name: 'kev',
    async decide({ sim, world, moves, askRetire }) {
      const key = world.month + '/' + sim.id;
      assert(!expected.has(key) && !failed.has(key), 'One model call per decision');
      if (failed.size === 0) {
        failed.add(key);
        throw new Error('Simulated model outage');
      }
      const draw = drawFor(world.seed, world.month, sim.id, 'main');
      const replay = pick(sim, heuristicAnswers(sim, world, moves, askRetire), draw,
        drawFor(world.seed, world.month, sim.id, 'retire'));
      expected.set(key, { odds: replay.sharpened, move: replay.picked, draw });
      const different = moves.find(move => move.id !== replay.picked)?.id;
      return {
        provider: 'kev', model: 'test-model', latencyMs: 0, tokens: 0,
        answers: { main: Object.fromEntries(moves.map(move => [move.id, Number(move.id === different)])) },
      };
    },
  };
  const town = sharedWorld(storage, { decider, pop: 24 });
  const first = await town(0);
  const fallback = first.sims.find(sim => failed.has(first.month + '/' + sim.id));
  assert.equal(fallback?.decision?.provider, 'heuristic-fallback');
  assert.equal(fallback?.decision?.heuristicReplay, undefined);
  const residents = first.sims.filter(sim => sim.decision?.provider === 'kev');
  assert(residents.length > 0);
  for (const sim of residents) {
    const { draw, ...replay } = expected.get(first.month + '/' + sim.id)!;
    assert.equal(sim.draw, draw);
    assert.deepEqual(sim.decision?.heuristicReplay, replay);
    assert.deepEqual(Object.keys(sim.decision!.sampling!.odds), Object.keys(replay.odds));
  }
  const different = residents.find(sim => sim.decision?.sampling?.move !== sim.decision?.heuristicReplay?.move);
  assert(different, 'The same draw can lead to different moves');
  await town(1000);
  await town(DAY);
  const restarted = sharedWorld(storage, { pop: 24 });
  const archived = (await restarted.residentHistory(different.id)).find(row => row.month === first.month);
  assert.deepEqual(archived?.decision?.heuristicReplay, different.decision?.heuristicReplay);
  assert.equal(archived?.move, different.move);
});

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
  const currentDecisions = saved!.current.sims.flatMap(sim => sim.decision ? [sim.decision] : []);
  assert(currentDecisions.length > 0);
  assert(currentDecisions.every(decision => decision.reason === 'monthly'));
  assert(saved!.history!.some(month => Object.values(month.residents).some(sim => sim.decision?.reason === 'monthly')));
  const ledger = new Map(saved!.world.sims.map(sim => [sim.id, sim.flows]));
  assert.equal(await town(now + 1000).then(x => x.month), 121);
  assert.equal(saved!.pending?.month, 122);
  assert(saved!.pending?.sims.some(sim => sim.decision?.reason === 'monthly'));
  const firstMix = await town.decisionMix(122);
  assert.deepEqual(firstMix.months.map(row => row.month), Array.from({ length: 12 }, (_, i) => 110 + i));
  assert.equal(firstMix.decisions, first.sims.filter(sim => sim.move).length + saved!.history!
    .flatMap(month => Object.values(month.residents)).filter(sim => sim.move).length);
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
  assert.deepEqual((await town.residentHistory(id)).at(-1)?.cashFlow, source.cashFlow);
  assert((await town.residentHistory(id)).some(row => row.month < 121 && row.decision?.provider === 'heuristic' && !row.hasProbe));
  const restarted = sharedWorld(store, { pop: 12 });
  assert.equal(await restarted(now + DAY).then(x => x.month), 122);
  const history = (await restarted.residentHistory(id)).filter(row => row.month >= 121);
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
  assert.deepEqual(saved!.history?.find(row => row.month === 121)?.residents[id].probe, source.probe);
  const beforeProbe = await store.load();
  const comparison = await restarted.counterfactual(id, 121);
  assert.equal(comparison.status, 'ready');
  assert.deepEqual(comparison.base, original.probabilities);
  assert.deepEqual(comparison.variant, source.probe.heuristicOdds);
  assert.equal(comparison.afterCoin, comparison.beforeCoin * 2);
  assert.deepEqual(await store.load(), beforeProbe);
  assert.deepEqual(await restarted.counterfactual(id, 123), { status: 'unavailable' });
  assert.deepEqual((await restarted.decisionMix(121)).months.map(row => row.month), firstMix.months.slice(1).map(row => row.month));
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
  delete saved!.history;
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
