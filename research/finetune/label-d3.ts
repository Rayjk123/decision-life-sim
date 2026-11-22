// Label every sampled state with d3 (the teacher for the distillation runs): its full probabilities for every
// question, from the desktop's Ollama /v1/systemone. Resumable: already-labelled ids are skipped.
//   npx tsx research/finetune/label-d3.ts [--url http://<ollama-host>:11434] [--model d3] [--concurrency 4]
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: {
  url: { type: 'string', default: process.env.KEV_URL ?? 'http://127.0.0.1:11434' },
  model: { type: 'string', default: 'd3' },
  in: { type: 'string', default: 'research/finetune/data/states.jsonl' },
  out: { type: 'string', default: 'research/finetune/data/labels/d3.jsonl' },
  concurrency: { type: 'string', default: '4' },
} });
const rows = readFileSync(a.in!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const done = new Set(existsSync(a.out!) ? readFileSync(a.out!, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
const todo = rows.filter((r) => !done.has(r.id));
console.log(`${rows.length} states, ${done.size} already labelled, ${todo.length} to go`);
const { mkdirSync } = await import('node:fs');
mkdirSync('research/finetune/data/labels', { recursive: true });

let next = 0, ok = 0, failed = 0;
const t0 = Date.now();
async function worker() {
  while (next < todo.length) {
    const r = todo[next++];
    try {
      const res = await fetch(`${a.url!.replace(/\/$/, '')}/v1/systemone`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: a.model, state: r.state, questions: r.questions }), signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json() as { answers: Record<string, { probabilities?: Record<string, number>; noul?: number }> };
      const labels: Record<string, unknown> = {};
      for (const [q, ans] of Object.entries(j.answers)) {
        labels[q] = ans.probabilities ? { probabilities: ans.probabilities } : typeof ans.noul === 'number' ? { probabilities: { true: ans.noul, false: 1 - ans.noul } } : null;
      }
      appendFileSync(a.out!, JSON.stringify({ id: r.id, source: a.model, labels }) + '\n');
      ok++;
    } catch (e) {
      failed++;
      if (failed <= 5) console.error(`${r.id}: ${(e as Error).message}`);
    }
    if ((ok + failed) % 250 === 0) console.log(`${ok + failed}/${todo.length} · ${((ok + failed) / ((Date.now() - t0) / 1000)).toFixed(1)}/s · ${failed} failed`);
  }
}
await Promise.all(Array.from({ length: Number(a.concurrency) }, worker));
console.log(`done: ${ok} labelled, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
