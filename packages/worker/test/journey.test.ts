// Iteration 29: every sim's month-by-month journey (series, events, decisions with state deltas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { heuristicDecider } from '@dls/sim-core';
import { runWorld } from '../src/runner.ts';
import { journeyStates, type Journey } from '../src/store.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'dls-journey-'));
const lines = (p: string) => readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('journeys match the logs: one row per month alive, every event and every decision', async () => {
  const out = tmp();
  const { world } = await runWorld({ seed: 7, pop: 40, months: 180, decider: heuristicDecider, outDir: out });
  const people = join(out, 'public/people');
  const files = readdirSync(people).filter((f) => f.endsWith('-journey.json'));
  assert.ok(files.length >= world.sims.length, 'a journey for every living sim (and the dead)');
  const events = lines(join(out, 'log/events.ndjson'));
  const decisions = lines(join(out, 'log/decisions.ndjson'));
  for (const s of world.sims.slice(0, 15)) {
    const j = JSON.parse(readFileSync(join(people, `${s.id}-journey.json`), 'utf8')) as Journey;
    // Sims from the town's history start at the first visible month; newcomers start the month they arrived.
    const start = Math.max(s.arrivedMonth, 1);
    assert.equal(j.m[0], start, `${s.id} starts the month it arrived (or month 1, if it arrived during the history)`);
    assert.equal(j.m.length, world.month - start + 1, `${s.id} has a row for every month`);
    for (const k of ['cash', 'savings', 'invested', 'property', 'other', 'debt', 'spend', 'inflow', 'outflow'] as const) assert.equal(j[k].length, j.m.length);
    assert.equal(j.events.length, events.filter((e) => e.simId === s.id && e.type !== 'decision').length, `${s.id} events`);
    assert.equal(j.decisions.length, decisions.filter((d) => d.simId === s.id).length, `${s.id} decisions`);
  }
});

test('decision states rebuilt from the deltas equal the full states in the public decision files', async () => {
  const out = tmp();
  const { world } = await runWorld({ seed: 8, pop: 40, months: 180, decider: heuristicDecider, outDir: out });
  const s = world.sims.find((x) => readdirSync(join(out, 'public/people')).includes(`${x.id}-journey.json`))!;
  const j = JSON.parse(readFileSync(join(out, `public/people/${s.id}-journey.json`), 'utf8')) as Journey;
  assert.ok(j.decisions.length >= 3);
  const states = journeyStates(j);
  j.decisions.forEach((d, i) => {
    const pub = JSON.parse(readFileSync(join(out, `public/decisions/${d.month}.json`), 'utf8')) as Array<{ simId: string; state: unknown }>;
    assert.deepEqual(states[i], pub.find((p) => p.simId === s.id)!.state, `month ${d.month}`);
  });
  assert.ok(j.decisions.slice(1).some((d) => Object.keys(d.stateDelta ?? {}).length < Object.keys(states[0]).length), 'later decisions store only what changed');
});

test('resuming gives byte-identical journey files', async () => {
  const a = tmp(), b = tmp();
  await runWorld({ seed: 4, pop: 50, months: 36, decider: heuristicDecider, outDir: a });
  await runWorld({ seed: 4, pop: 50, months: 30, decider: heuristicDecider, outDir: b });   // stops mid-year, after the month-24 snapshot
  await runWorld({ seed: 4, pop: 50, months: 36, decider: heuristicDecider, outDir: b, resume: true });
  const ja = readdirSync(join(a, 'public/people')).filter((f) => f.endsWith('-journey.json')).sort();
  const jb = readdirSync(join(b, 'public/people')).filter((f) => f.endsWith('-journey.json')).sort();
  assert.deepEqual(jb, ja);
  for (const f of ja) assert.equal(readFileSync(join(b, 'public/people', f), 'utf8'), readFileSync(join(a, 'public/people', f), 'utf8'), f);
});
