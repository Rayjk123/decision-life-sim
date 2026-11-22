// Integration tests for the worker: files written, resume, Kev failures and the disk cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRequest, createWorld, heuristicDecider, inSchool, legalMoves, runMonth } from '@dls/sim-core';
import { runWorld } from '../src/runner.ts';
import { kevDecider } from '../src/kev.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'dls-'));
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

test('a run writes the read model the browser needs', async () => {
  const dir = tmp();
  await runWorld({ seed: 3, pop: 60, months: 36, decider: heuristicDecider, outDir: dir });
  const pub = join(dir, 'public');
  assert.equal(read(join(pub, 'latest.json')).month, 36);
  const month = read(join(pub, 'months/36.json'));
  assert.equal(month.sims.length, read(join(pub, 'latest.json')).population);
  assert.ok(month.economy && month.market.regime);
  const decisions = readdirSync(join(pub, 'decisions')).map((f) => read(join(pub, 'decisions', f))).flat();
  assert.ok(decisions.length > 0);
  assert.ok(decisions[0].state && decisions[0].descriptions && decisions[0].answers.main);
  const people = readdirSync(join(pub, 'people'));
  assert.ok(people.length > 0);
  const person = read(join(pub, 'people', people[0]));
  for (const key of ['balance', 'thisMonth', 'life', 'netWorthByYear', 'assets']) assert.ok(key in person, `person file missing ${key}`);
  assert.equal(read(join(pub, 'stats.json')).years.length, 3);
  for (const m of [12, 24, 36]) assert.ok(existsSync(join(dir, `snapshots/month-${m}.json`)));
  const logLine = readFileSync(join(dir, 'log/decisions.ndjson'), 'utf8').split('\n')[0];
  assert.ok(!('state' in JSON.parse(logLine)), 'the log stays lean: no state text');
});

test('resuming from a snapshot gives exactly the same world as running straight through', async () => {
  const a = tmp(), b = tmp();
  const straight = await runWorld({ seed: 4, pop: 50, months: 36, decider: heuristicDecider, outDir: a });
  await runWorld({ seed: 4, pop: 50, months: 24, decider: heuristicDecider, outDir: b });
  const resumed = await runWorld({ seed: 4, pop: 50, months: 36, decider: heuristicDecider, outDir: b, resume: true });
  assert.equal(resumed.resumedFrom, 24);
  assert.equal(JSON.stringify(resumed.world), JSON.stringify(straight.world));
  const months = readFileSync(join(b, 'log/events.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).month);
  assert.equal(Math.max(...months), 36);
});

test('when Kev errors, decisions fall back to heuristic mode and the month still completes', async () => {
  const server = createServer((_req, res) => { res.statusCode = 500; res.end('boom'); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const w = createWorld(5, 60);
  for (let i = 0; i < 100; i++) await runMonth(w, heuristicDecider);
  const kev = kevDecider({ url, retries: 0, timeoutMs: 2000 });
  const r = await runMonth(w, kev);
  server.close();
  assert.ok(r.calls > 0);
  assert.equal(r.fallbacks, r.calls);
  assert.ok(r.decisions.every((d) => d.provider === 'heuristic-fallback'));
});

test('the Kev disk cache answers a repeated request with no server at all', async () => {
  let hits = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits++;
      const ids = Object.keys(JSON.parse(body).questions.main.criteria);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ answers: { main: { type: 'choice', probabilities: Object.fromEntries(ids.map((id) => [id, 1 / ids.length])) } }, usage: { input_tokens: 10 }, latency_ms: 5 }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cacheFile = join(tmp(), 'cache.ndjson');
  const w = createWorld(6, 60);
  for (let i = 0; i < 100; i++) await runMonth(w, heuristicDecider);
  const sim = w.sims.find((s) => !inSchool(s, w.month) && legalMoves(s, w).length > 2)!;
  const req = buildRequest(sim, w);
  await kevDecider({ url, cacheFile }).decide(req);
  server.close();
  const second = kevDecider({ url: 'http://127.0.0.1:1', cacheFile, retries: 0, timeoutMs: 500 });
  const r = await second.decide(req);
  assert.equal(hits, 1);
  assert.equal(second.stats.cacheHits, 1);
  assert.equal(r.tokens, 10);
});
