// Fingerprint of every request the golden suite sends to a model (30 scenarios + 18 pair variants, every state
// style). The published model results in docs/results/data were produced against exactly these requests; if a
// rules, wording or prompt change alters what the model sees, those results silently describe a different test.
//   npm run eval:fingerprint              check against docs/results/data/golden-fingerprint.json (exit 1 on drift)
//   npm run eval:fingerprint -- --write   accept the current requests (do this only after re-running model evals,
//                                         or note in docs/results.md which published results are now stale)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { StateStyle } from '@dls/sim-core';
import { applyChange, requestFor } from './build.ts';
import { loadGolden } from './suite.ts';

export const STYLES: StateStyle[] = ['words', 'numbers', 'terse', 'focused'];
export const FINGERPRINT_FILE = 'docs/results/data/golden-fingerprint.json';

export function goldenFingerprint(): Record<string, string> {
  const { scenarios, pairs } = loadGolden();
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const cases = [
    ...scenarios.map((sc) => [sc.id, sc] as const),
    ...pairs.map((p) => [`${p.id}:variant`, applyChange(byId.get(p.base)!, p)] as const),
  ];
  const out: Record<string, string> = {};
  for (const style of STYLES) for (const [key, sc] of cases) {
    const r = requestFor(sc, style);
    out[`${style}/${key}`] = createHash('sha256').update(JSON.stringify({ state: r.state, questions: r.questions })).digest('hex').slice(0, 16);
  }
  return out;
}

export function fingerprintDrift(now: Record<string, string>, recorded: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(now), ...Object.keys(recorded)]);
  return [...keys].filter((k) => now[k] !== recorded[k]).sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const now = goldenFingerprint();
  if (process.argv.includes('--write')) {
    writeFileSync(FINGERPRINT_FILE, JSON.stringify(now, null, 1) + '\n');
    console.log(`Wrote ${FINGERPRINT_FILE} (${Object.keys(now).length} requests)`);
  } else {
    const recorded = existsSync(FINGERPRINT_FILE) ? JSON.parse(readFileSync(FINGERPRINT_FILE, 'utf8')) : {};
    const drift = fingerprintDrift(now, recorded);
    if (drift.length) {
      console.error(`Golden requests changed (${drift.length} of ${Object.keys(now).length}): ${drift.slice(0, 8).join(', ')}${drift.length > 8 ? ', ...' : ''}`);
      console.error('The published model results were produced on different requests. Re-run the model evals, or accept with');
      console.error('`npm run eval:fingerprint -- --write` and mark the affected results as stale in docs/results.md.');
      process.exit(1);
    }
    console.log(`golden requests unchanged (${Object.keys(now).length} across ${STYLES.length} styles)`);
  }
}
