// Phase 2 of savings (iteration 21): a model-facing "move cash to savings" choice, and a heuristic where many
// people never invest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, createWorld, flowTotal, heuristicAnswers, heuristicDecider, k, legalMoves, runMonth, spawnSim, type Sim, type World } from '../src/index.ts';

async function setup(): Promise<{ w: World; s: Sim }> {
  const w = createWorld(6, 30);
  for (let i = 0; i < 120; i++) await runMonth(w, heuristicDecider);
  const s = spawnSim(w, w.month - 15 * 12);
  Object.assign(s, { archetype: 'balanced', saveHabit: undefined, employed: true, salary: k(80), cash: k(40), savings: 0, index: 0, stocks: 0, loans: [], assets: [], memory: [], missedPayments: 0, flows: {} });
  s.traits = { risk: 0.5, debt: 0.5, status: 0.5, patience: 0.5, discipline: 0.5, herding: 0.5, lossAversion: 0.5 };
  return { w, s };
}

test('with spare cash, saving is offered and moves money into savings through the ledger', async () => {
  const { w, s } = await setup();
  const move = legalMoves(s, w).find((m) => m.kind === 'save_cash');
  assert.ok(move, 'save_cash is legal with spare cash');
  assert.match(move!.description, /savings account/);
  const before = s.cash;
  const r = applyMove(w, s, move!, 4);
  assert.ok(r.valid);
  assert.ok((s.savings ?? 0) > 0);
  assert.equal(before - s.cash, s.savings);
  assert.equal(s.cash - before, flowTotal(s));
});

test('the heuristic: loss-averse sims prefer saving, savers rarely invest, natural investors prefer the index', async () => {
  const { w, s } = await setup();
  const moves = legalMoves(s, w);
  const p = (sim: Sim, id: string) => heuristicAnswers(sim, w, moves, false).main[id] ?? 0;
  const calm = p(s, 'save_cash');
  s.traits = { ...s.traits, lossAversion: 0.9, risk: 0.2 };
  assert.ok(p(s, 'save_cash') > calm, 'more loss aversion, more saving');
  s.archetype = 'saver'; s.traits = { ...s.traits, risk: 0.2, lossAversion: 0.85 };
  assert.ok(p(s, 'save_cash') > 3 * p(s, 'invest_index'), 'a cautious saver mostly saves');
  s.archetype = 'index'; s.traits = { ...s.traits, risk: 0.5, lossAversion: 0.5 };
  assert.ok(p(s, 'invest_index') > p(s, 'save_cash'), 'an index investor invests');
});
