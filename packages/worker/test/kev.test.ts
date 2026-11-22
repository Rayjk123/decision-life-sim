import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildQuestions, buildState, createWorld, heuristicDecider, legalMoves, runMonth, inSchool } from '@dls/sim-core';
import { kevDecider } from '../src/kev.ts';

test('the Kev gateway sends the TypeSafe request shape, parses answers and caches repeats', async () => {
  let hits = 0;
  let lastBody: any;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      hits++;
      lastBody = JSON.parse(raw);
      const ids = Object.keys(lastBody.questions.main.criteria);
      const probs = Object.fromEntries(ids.map((id, i) => [id, i === 0 ? 0.7 : 0.3 / (ids.length - 1)]));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        model: 'kev-latest',
        answers: {
          main: { type: 'choice', choice: ids[0], confidence: 0.4, probabilities: probs },
          ...(lastBody.questions.invest_share ? { invest_share: { type: 'score', score: 2, probabilities: { '0': 0, '1': 0.2, '2': 0.6, '3': 0.2, '4': 0 } } } : {}),
        },
        usage: { input_tokens: 321 },
        latency_ms: 12,
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const world = createWorld(2, 60);
  for (let i = 0; i < 150; i++) await runMonth(world, heuristicDecider);
  const sim = world.sims.find((s) => !inSchool(s, world.month) && legalMoves(s, world).length >= 2)!;
  const moves = legalMoves(sim, world);
  const req = { sim, world, moves, askRetire: false, state: buildState(sim, world), questions: buildQuestions(sim, moves, false) };

  const kev = kevDecider({ url });
  const r1 = await kev.decide(req);
  const r2 = await kev.decide(req);
  server.close();

  assert.equal(hits, 1, 'second identical request should come from the cache');
  assert.equal(lastBody.model, 'kev-latest');
  assert.equal(typeof lastBody.state, 'object');
  assert.equal(lastBody.questions.main.type, 'choice');
  assert.deepEqual(Object.keys(lastBody.questions.main.criteria), moves.map((m) => m.id));
  assert.equal(r1.tokens, 321);
  assert.ok(Math.abs(Object.values(r1.answers.main).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(r1, r2);
});
