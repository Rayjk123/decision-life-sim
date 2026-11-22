// Iteration 9: every decision records which model answered, so a d3 run is never labelled "kev".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, heuristicDecider, runMonth, type Decider, type DecisionRecord } from '@dls/sim-core';

test('decision records carry the model that answered; heuristic decisions carry none', async () => {
  const d3Like: Decider = {
    name: 'kev',
    async decide(req) { const r = await heuristicDecider.decide(req); return { ...r, provider: 'kev', model: 'd3' }; },
  };
  const world = createWorld(5, 60);
  for (let i = 0; i < 150; i++) await runMonth(world, heuristicDecider);
  const recs: DecisionRecord[] = [];
  for (let i = 0; i < 12; i++) recs.push(...(await runMonth(world, d3Like, { policy: 'monthly' })).decisions);
  assert.ok(recs.length > 0);
  assert.ok(recs.every((r) => r.provider === 'kev' && r.model === 'd3'));
  const heur = (await runMonth(world, heuristicDecider, { policy: 'monthly' })).decisions;
  assert.ok(heur.length > 0 && heur.every((r) => r.model === undefined && r.provider === 'heuristic'));
});
