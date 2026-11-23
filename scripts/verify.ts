// The quality gate every change must pass (see docs/LOOP.md "Verification gates").
//   npm run verify            all gates, stops at the first failure
//   npm run verify -- --all   run every gate even after a failure (for a full report)
// Thresholds live in scripts/verify.baseline.json. Raise them when quality improves; never lower them to make a change pass.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { heuristicDecider } from '@dls/sim-core';
import { runSuite } from '../packages/evals/src/suite.ts';
import { parseTestSummary, regressions, scanForLeaks } from './verify-lib.ts';

const ROOT = join(import.meta.dirname, '..');
const baseline = JSON.parse(readFileSync(join(import.meta.dirname, 'verify.baseline.json'), 'utf8')) as {
  minTests: number; heuristic: Record<string, number>;
};
const runAll = process.argv.includes('--all');

type Gate = { name: string; run: () => Promise<string> | string };
const sh = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

const gates: Gate[] = [
  { name: 'G1 types', run: () => {
    const r = sh('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit']);
    if (!r.ok) throw new Error(r.out.trim().split('\n').slice(0, 20).join('\n'));
    return 'no type errors';
  } },
  { name: 'G2-G5 tests (determinism, ledger, golden validity)', run: () => {
    const r = sh('node', ['--import', 'tsx', '--test', ...execFileSync('sh', ['-c', 'ls packages/*/test/*.test.ts'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')]);
    const s = parseTestSummary(r.out);
    if (!s) throw new Error(`could not read the test summary:\n${r.out.slice(-2000)}`);
    if (s.fail > 0 || !r.ok) throw new Error(`${s.fail} failing:\n${r.out.split('\n').filter((l) => /^not ok/.test(l)).join('\n')}`);
    if (s.tests < baseline.minTests) throw new Error(`test count fell to ${s.tests} (baseline ${baseline.minTests})`);
    return `${s.pass}/${s.tests} pass (baseline ≥ ${baseline.minTests})`;
  } },
  { name: 'G6 heuristic eval regression', run: async () => {
    const r = await runSuite(heuristicDecider, 'words', 1);
    const actual = { overall: r.summary.overall, pairPass: r.summary.pairPass, scenarioScore: r.summary.scenarioScore };
    const bad = regressions(actual, baseline.heuristic);
    if (bad.length) throw new Error(bad.join('\n'));
    return Object.entries(actual).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ');
  } },
  { name: 'G6 golden requests unchanged (published results valid)', run: () => {
    const r = sh('npx', ['tsx', 'packages/evals/src/fingerprint.ts']);
    if (!r.ok) throw new Error(r.out.trim());
    return r.out.trim().split('\n').pop() ?? '';
  } },
  { name: 'G7-G8 sim health + time budget', run: () => {
    const r = sh('npx', ['tsx', 'scripts/health.ts']);
    if (!r.ok) throw new Error(r.out.trim().split('\n').filter((l) => /❌|^ {5}|FAILED/.test(l)).join('\n') || r.out.slice(-2000));
    return r.out.trim().split('\n').pop() ?? '';
  } },
  { name: 'G10 UX smoke (real browser)', run: () => {
    const r = sh('npx', ['tsx', 'scripts/ux-smoke.ts']);
    if (!r.ok) throw new Error(r.out.trim().split('\n').filter((l) => /❌|FAILED|Error/.test(l)).join('\n') || r.out.slice(-2000));
    return r.out.trim().split('\n').pop()?.replace(/; screenshots in .*/, '') ?? '';
  } },
  { name: 'G10 Maple Hollow smoke (real browser)', run: () => {
    const r = sh('npx', ['tsx', 'scripts/town-ux-smoke.ts']);
    if (!r.ok) throw new Error(r.out.trim().slice(-3000));
    return r.out.trim().split('\n').pop() ?? '';
  } },
  { name: 'G9 docs in sync', run: () => {
    const r = sh('npx', ['tsx', 'scripts/results-page.ts', '--check']);
    if (!r.ok) throw new Error(r.out.trim());
    return r.out.trim();
  } },
  { name: 'G9 no leaks in tracked files', run: () => {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
      .filter((f) => !/\.(png|jpg|gif|ico|woff2?)$/.test(f) && f !== 'package-lock.json');
    const contents = Object.fromEntries(files.map((f) => { try { return [f, readFileSync(join(ROOT, f), 'utf8')]; } catch { return [f, '']; } }));
    const leaks = scanForLeaks(contents);
    if (leaks.length) throw new Error(leaks.map((l) => `${l.file}:${l.line} ${l.kind}: ${l.text}`).join('\n'));
    return `${files.length} files clean`;
  } },
];

let failed = 0;
const t0 = Date.now();
for (const g of gates) {
  const s = Date.now();
  try {
    const msg = await g.run();
    console.log(`✅ ${g.name.padEnd(48)} ${msg} (${((Date.now() - s) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed++;
    console.log(`❌ ${g.name.padEnd(48)} FAILED (${((Date.now() - s) / 1000).toFixed(1)}s)\n${String((e as Error).message ?? e).replace(/^/gm, '     ')}`);
    if (!runAll) break;
  }
}
console.log(failed ? `\nverify FAILED: ${failed} gate(s)` : `\nverify passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
