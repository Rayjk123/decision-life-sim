// Decision gateway for Kev (and anything else speaking the TypeSafe /v1/systemone shape, such as Jev).
// Adds: request timeout, retries with backoff, and a cache keyed by the exact request so replays never re-call.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Answers, Decider, DecisionRequest, DecisionResult } from '@dls/sim-core';

export interface KevOptions {
  url: string;              // e.g. http://127.0.0.1:8009
  model?: string;           // request "model" field, default "kev-latest"
  apiKey?: string;          // KEV_API_KEY / TYPESAFE_API_KEY when the server requires one
  timeoutMs?: number;
  retries?: number;
  cacheFile?: string;       // NDJSON file of {key, result}; omit to disable the disk cache
}

interface KevAnswer { type: string; choice?: string; noul?: number; score?: number; probabilities?: Record<string, number> }
interface KevResponse { answers: Record<string, KevAnswer>; usage?: { input_tokens?: number }; latency_ms?: number }

export function kevDecider(opts: KevOptions): Decider & { stats: { calls: number; cacheHits: number; latencies: number[]; errors: number } } {
  const model = opts.model ?? 'kev-latest';
  const cache = new Map<string, DecisionResult>();
  if (opts.cacheFile && existsSync(opts.cacheFile)) {
    for (const line of readFileSync(opts.cacheFile, 'utf8').split('\n')) {
      if (!line) continue;
      try { const { key, result } = JSON.parse(line); cache.set(key, result); } catch { /* skip a torn line */ }
    }
  }
  if (opts.cacheFile) mkdirSync(dirname(opts.cacheFile), { recursive: true });
  const stats = { calls: 0, cacheHits: 0, latencies: [] as number[], errors: 0 };

  async function post(body: unknown): Promise<KevResponse> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= (opts.retries ?? 2); attempt++) {
      try {
        const res = await fetch(`${opts.url.replace(/\/$/, '')}/v1/systemone`, {
          method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        });
        if (res.status >= 500 || res.status === 429) throw new Error(`Kev HTTP ${res.status}`);
        if (!res.ok) throw Object.assign(new Error(`Kev HTTP ${res.status}: ${await res.text()}`), { fatal: true });
        return (await res.json()) as KevResponse;
      } catch (e) {
        lastErr = e;
        if ((e as { fatal?: boolean }).fatal) break;
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }
    throw lastErr;
  }

  return {
    name: 'kev',
    stats,
    async decide(req: DecisionRequest): Promise<DecisionResult> {
      const body = { model, state: req.state, questions: req.questions };
      const key = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      const hit = cache.get(key);
      if (hit) { stats.cacheHits++; return hit; }
      const started = Date.now();
      stats.calls++;
      let r: KevResponse;
      try { r = await post(body); } catch (e) { stats.errors++; throw e; }
      const latency = r.latency_ms ?? Date.now() - started;
      stats.latencies.push(latency);
      const result: DecisionResult = { answers: toAnswers(r, req), provider: 'kev', latencyMs: latency, tokens: r.usage?.input_tokens ?? 0 };
      cache.set(key, result);
      if (opts.cacheFile) appendFileSync(opts.cacheFile, JSON.stringify({ key, result }) + '\n');
      return result;
    },
  };
}

function toAnswers(r: KevResponse, req: DecisionRequest): Answers {
  const main = r.answers.main?.probabilities ?? {};
  // keep only legal moves and renormalize (defensive: the server should only return these)
  const legal = Object.fromEntries(req.moves.map((m) => [m.id, main[m.id] ?? 0]));
  const total = Object.values(legal).reduce((s, v) => s + v, 0) || 1;
  const answers: Answers = { main: Object.fromEntries(Object.entries(legal).map(([key, v]) => [key, v / total])) };
  if (r.answers.invest_share?.probabilities) answers.investShare = r.answers.invest_share.probabilities;
  if (typeof r.answers.retire?.noul === 'number') answers.retire = r.answers.retire.noul;
  return answers;
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
