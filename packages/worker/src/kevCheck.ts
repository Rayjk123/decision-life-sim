// Smoke test for a running Kev server: one real decision, side by side with heuristic mode, plus a throughput probe.
//   npm run kev:check            (expects ./scripts/kev.sh running on :8009)
import {
  ARCHETYPE, createWorld, heuristicAnswers, heuristicDecider, legalMoves, buildQuestions, buildState, runMonth, ageInt, inSchool,
} from '@dls/sim-core';
import { kevDecider, percentile } from './kev.ts';

const url = process.env.KEV_URL ?? 'http://127.0.0.1:8009';
const model = process.env.KEV_MODEL ?? 'kev-latest';   // e.g. KEV_MODEL=d3 KEV_URL=http://<ollama-host>:11434
try {
  const r = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) });
  console.log(`Kev server at ${url}: ${r.ok ? 'up' : `HTTP ${r.status}`}`);
} catch {
  console.error(`No Kev server at ${url}. Start it with ./scripts/kev.sh and try again.`);
  process.exit(1);
}

// Grow a small world in heuristic mode so sims have real histories, then ask Kev about some of them.
const world = createWorld(7, 120);
for (let i = 0; i < 180; i++) await runMonth(world, heuristicDecider);
const kev = kevDecider({ url, model, apiKey: process.env.KEV_API_KEY, timeoutMs: 120_000 });

const candidates = world.sims.filter((s) => !inSchool(s, world.month) && legalMoves(s, world).length >= 3).slice(0, 24);
if (!candidates.length) { console.error('No sims with real choices yet.'); process.exit(1); }

const first = candidates[0];
const moves = legalMoves(first, world);
const askRetire = !first.retired && ageInt(first, world.month) >= 55;
const req = { sim: first, world, moves, askRetire, state: buildState(first, world), questions: buildQuestions(first, moves, askRetire) };
console.log('\nState sent to Kev:\n' + JSON.stringify(req.state, null, 2));
console.log('\nOptions:\n' + moves.map((m) => `  ${m.id}: ${m.description}`).join('\n'));
const res = await kev.decide(req);
const heur = heuristicAnswers(first, world, moves, askRetire);
console.log(`\n${first.name} (${ARCHETYPE[first.archetype].label}) · Kev ${res.latencyMs}ms · ${res.tokens} input tokens`);
console.log('  option'.padEnd(22) + 'kev'.padStart(8) + 'heuristic'.padStart(12));
for (const m of moves) console.log(`  ${m.id.padEnd(20)}${(Math.round((res.answers.main[m.id] ?? 0) * 100) + '%').padStart(8)}${(Math.round((heur.main[m.id] ?? 0) * 100) + '%').padStart(12)}`);
if (res.answers.investShare) console.log(`  invest_share probabilities: ${JSON.stringify(res.answers.investShare)}`);

// Throughput: the rest of the candidates, 8 at a time.
const started = Date.now();
await Promise.all(Array.from({ length: 8 }, async (_, w) => {
  for (let i = 1 + w; i < candidates.length; i += 8) {
    const s = candidates[i];
    const mv = legalMoves(s, world);
    const ar = !s.retired && ageInt(s, world.month) >= 55;
    await kev.decide({ sim: s, world, moves: mv, askRetire: ar, state: buildState(s, world), questions: buildQuestions(s, mv, ar) });
  }
}));
const n = candidates.length - 1;
const secs = (Date.now() - started) / 1000;
console.log(`\nThroughput: ${n} calls in ${secs.toFixed(1)}s = ${(n / secs).toFixed(1)} calls/s · p50 ${percentile(kev.stats.latencies, 50)}ms · p95 ${percentile(kev.stats.latencies, 95)}ms`);
console.log(`At this rate 1,000 calls take about ${Math.round(1000 / (n / secs))}s; 300 calls (reviews + events for 1,000 sims) about ${Math.round(300 / (n / secs))}s.`);
