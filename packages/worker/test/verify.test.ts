// The verify gate's own logic: leak scanning, test-summary parsing, regression detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestSummary, regressions, scanForLeaks } from '../../../scripts/verify-lib.ts';

const lan = ['192', '168', '50', '7'].join('.');   // built at runtime so this file never trips the scanner itself

test('leak scan flags LAN addresses and tokens, and ignores placeholders and prose', () => {
  const leaks = scanForLeaks({
    'a.md': `curl http://${lan}:11434/api/tags`,
    'b.ts': `const t = "ghp_${'x'.repeat(36)}";`,
    'c.md': 'point KEV_URL at http://<ollama-host>:11434 and never commit 192.168.* addresses',
  });
  assert.deepEqual(leaks.map((l) => [l.file, l.kind]), [['a.md', 'private LAN address'], ['b.ts', 'GitHub token']]);
  assert.equal(leaks[0].line, 1);
});

test('test summary parsing reads node --test TAP totals', () => {
  assert.deepEqual(parseTestSummary('ok 1 - x\n1..40\n# tests 40\n# suites 0\n# pass 39\n# fail 1\n'), { tests: 40, pass: 39, fail: 1 });
  assert.equal(parseTestSummary('no summary here'), null);
});

test('regressions: below baseline beyond tolerance fails, equal or better passes, missing metric fails', () => {
  assert.deepEqual(regressions({ overall: 0.77, pairs: 0.56 }, { overall: 0.767, pairs: 0.5556 }), []);
  assert.equal(regressions({ overall: 0.70 }, { overall: 0.767 }).length, 1);
  assert.match(regressions({}, { overall: 0.767 })[0], /missing/);
});
