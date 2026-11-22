// Eval comparison: deltas, regression verdict, and pass/fail flips, on the recorded d3 runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns, formatComparison, loadRun } from '../src/compare.ts';

const words = loadRun('docs/results/data/d3-4b-words.json');
const focused = loadRun('docs/results/data/d3-4b-focused.json');

test('a run compared with itself has no deltas, flips or regression', () => {
  const c = compareRuns(words, words);
  assert.deepEqual(c.flips, []);
  assert.deepEqual(c.regressed, []);
  assert.equal(c.deltas.overall, 0);
});

test('d3 focused vs words: pairs regress beyond 2 points and the flipped pairs are listed', () => {
  const c = compareRuns(focused, words);
  assert.ok(c.deltas.pairPass < -0.02);
  assert.ok(c.regressed.includes('pairPass'));
  const pairFlips = c.flips.filter((f) => f.kind === 'pair');
  assert.ok(pairFlips.length >= 3 && pairFlips.some((f) => !f.now));
  assert.match(formatComparison(c, 'focused', 'words'), /REGRESSION: .*pairPass/);
});

test('tolerance: a small drop is not a regression', () => {
  const slightly = { ...words, summary: { ...words.summary, overall: words.summary.overall - 0.01 } };
  assert.deepEqual(compareRuns(slightly, words, 0.02).regressed, []);
  assert.deepEqual(compareRuns(slightly, words, 0.005).regressed, ['overall']);
});
