import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heuristicDecider } from '@dls/sim-core';
import { applyChange, buildScenario, mass, matches, requestFor } from '../src/build.ts';
import { gradePair, gradeScenario } from '../src/grade.ts';
import { loadGolden, randomDecider, runSuite } from '../src/suite.ts';

const { scenarios, pairs } = loadGolden();

test('golden dataset: ids are unique and every scenario has a rationale', () => {
  const ids = scenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of scenarios) assert.ok(s.rationale.length > 20, `${s.id} needs a rationale`);
  for (const p of pairs) assert.ok(p.rationale.length > 10, `${p.id} needs a rationale`);
});

test('golden dataset: every scenario builds and its expected options are legal moves', () => {
  for (const sc of scenarios) {
    const req = requestFor(sc, 'words');
    const ids = req.moves.map((m) => m.id);
    for (const p of sc.expect.options) assert.ok(ids.some((id) => matches(p, id)), `${sc.id}: ${p} is not legal (legal: ${ids.join(', ')})`);
    for (const p of sc.expect.best) assert.ok(ids.some((id) => matches(p, id)) || !sc.expect.options.includes(p), `${sc.id}: best ${p}`);
    if (sc.expect.retire) assert.ok(req.askRetire, `${sc.id}: expects a retirement answer but retirement is not offered`);
  }
});

test('golden dataset: every pair has a base, and its measured moves are legal in both versions', () => {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  for (const p of pairs) {
    const base = byId.get(p.base);
    assert.ok(base, `${p.id}: unknown base ${p.base}`);
    const variant = applyChange(base!, p);
    for (const sc of [base!, variant]) {
      const req = requestFor(sc, 'words');
      if (p.measure === 'retire') { assert.ok(req.askRetire, `${p.id}: retirement not offered in ${sc.id}`); continue; }
      const patterns = Array.isArray(p.measure) ? p.measure : [p.measure];
      assert.ok(req.moves.some((m) => patterns.some((pt) => matches(pt, m.id))), `${p.id}: none of ${patterns} legal in ${sc.id}`);
    }
  }
});

test('scenario builder sets age, money and debts exactly', () => {
  const sc = scenarios.find((s) => s.id === 'S-card-debt')!;
  const { sim, world } = buildScenario(sc);
  assert.equal(Math.floor((world.month - sim.birthMonth) / 12), 34);
  assert.equal(sim.cash, 6_000_000);
  assert.equal(sim.loans.find((l) => l.kind === 'card')?.balance, 1_200_000);
});

test('every state style produces a different, non-empty state', () => {
  const sc = scenarios[0];
  const words = JSON.stringify(requestFor(sc, 'words').state);
  const numbers = JSON.stringify(requestFor(sc, 'numbers').state);
  const terse = JSON.stringify(requestFor(sc, 'terse').state);
  assert.ok(words.length > 100 && numbers !== words && terse.length < words.length);
});

test('matches and mass handle wildcards', () => {
  assert.ok(matches('start_*', 'start_coffee'));
  assert.ok(!matches('start_*', 'buy_car'));
  assert.equal(mass({ start_a: 0.2, start_b: 0.3, nothing: 0.5 }, 'start_*'), 0.5);
  assert.equal(mass({ a: 0.2, b: 0.3, c: 0.5 }, ['a', 'c']), 0.7);
});

test('grader: a perfect answer scores 1 and a contrary answer fails', () => {
  const expect = { options: ['a', 'b'], best: ['a'], avoid: ['b'], maxAvoidMass: 0.3, constraints: [{ more: 'a', than: 'b' }] };
  const good = gradeScenario({ main: { a: 0.8, b: 0.2 } }, expect);
  assert.equal(good.score, 1);
  assert.ok(good.pass);
  const bad = gradeScenario({ main: { a: 0.2, b: 0.8 } }, expect);
  assert.equal(bad.score, 0);
  assert.ok(!bad.pass);
});

test('grader: ties earn no top-pick credit, retirement is graded when expected', () => {
  const tie = gradeScenario({ main: { a: 0.5, b: 0.5 } }, { options: [], best: ['a'] });
  assert.equal(tie.topOk, false);
  const r = gradeScenario({ main: { a: 1 }, retire: 0.2 }, { options: [], best: ['a'], retire: { min: 0.5 } });
  assert.equal(r.retireOk, false);
  assert.ok(r.score < 1);
});

test('pair grading respects direction and minimum change', () => {
  assert.ok(gradePair(0.1, 0.2, 'up').pass);
  assert.ok(!gradePair(0.1, 0.11, 'up').pass);
  assert.ok(gradePair(0.4, 0.3, 'down').pass);
  assert.ok(!gradePair(0.3, 0.4, 'down').pass);
});

test('integration: heuristic mode beats random on the golden suite', async () => {
  const rnd = await runSuite(randomDecider, 'words');
  const heur = await runSuite(heuristicDecider, 'words');
  assert.ok(heur.summary.overall > rnd.summary.overall + 0.2, `heuristic ${heur.summary.overall} vs random ${rnd.summary.overall}`);
  assert.equal(rnd.summary.pairPass < 0.2, true);
});
